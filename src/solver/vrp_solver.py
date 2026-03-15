#!/usr/bin/env python3
"""
VRP Solver using Google OR-Tools (Python).
Reads JSON from stdin, writes JSON to stdout.
Called from Node.js via child_process.execFile.
"""

import sys
import json
import time

def solve_vrp(data: dict) -> dict:
    from ortools.constraint_solver import routing_enums_pb2
    from ortools.constraint_solver import pywrapcp

    duration_matrix = data['duration_matrix']
    stops = data['stops']
    time_limit_ms = data.get('time_limit_ms', 5000)

    num_locations = len(duration_matrix)
    # depot is index 0 (driver start)

    manager = pywrapcp.RoutingIndexManager(num_locations, 1, 0)
    routing = pywrapcp.RoutingModel(manager)

    # Transit callback
    def time_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(duration_matrix[from_node][to_node])

    transit_callback_index = routing.RegisterTransitCallback(time_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Time dimension
    # Max horizon: 24 hours in seconds
    max_time = 86400
    routing.AddDimension(
        transit_callback_index,
        max_time,   # allow waiting time (slack)
        max_time,   # maximum time per vehicle
        False,      # don't force start cumul to zero
        'Time'
    )
    time_dimension = routing.GetDimensionOrDie('Time')

    # Add time window constraints per stop (index 1..N, skipping depot 0)
    for i, stop in enumerate(stops):
        node_index = i + 1  # +1 because depot is 0
        index = manager.NodeToIndex(node_index)

        tw_start = stop.get('time_window_start_s', 0)
        tw_end = stop.get('time_window_end_s', max_time)
        time_dimension.CumulVar(index).SetRange(tw_start, tw_end)

        # Add service time as slack
        service_time = stop.get('service_time_s', 0)
        routing.AddDisjunction([index])
        time_dimension.SlackVar(index).SetValue(service_time)

    # Search parameters
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.FromMilliseconds(time_limit_ms)

    start_time = time.time()
    solution = routing.SolveWithParameters(search_parameters)
    solver_time_ms = int((time.time() - start_time) * 1000)

    if not solution:
        return {
            'success': False,
            'error': 'No solution found',
            'solver_time_ms': solver_time_ms
        }

    # Extract ordered sequence
    sequence = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        if node != 0:  # skip depot
            stop_index = node - 1
            stop = stops[stop_index]
            # Get arrival time from time dimension
            arrival_s = solution.Value(time_dimension.CumulVar(index))
            sequence.append({
                'node_index': stop_index,
                'stop_id': stop['id'],
                'arrival_s': arrival_s
            })
        index = solution.Value(routing.NextVar(index))

    return {
        'success': True,
        'sequence': sequence,
        'solver_time_ms': solver_time_ms
    }


def main():
    try:
        input_data = json.load(sys.stdin)
        result = solve_vrp(input_data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'solver_time_ms': 0
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
