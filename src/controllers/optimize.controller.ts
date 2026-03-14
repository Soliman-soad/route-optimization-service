import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { getMatrix } from "../services/matrix.service";
import { solveRoute } from "../services/solver.service";
import { getRouteGeometry } from "../services/route.service";

export const optimizeRoute = async (req: Request, res: Response) => {
  try {
    const { driver, stops } = req.body;

    const matrix = await getMatrix(driver, stops);

    const optimized = solveRoute(matrix);

    const route = await getRouteGeometry(driver, stops, optimized);

    const record = await prisma.optimizationRequest.create({
      data: {
        driver_lat: driver.lat,
        driver_lng: driver.lng,
        stops_input: stops,
        optimized_sequence: optimized,
        route_geometry: route.geometry,
        total_distance: route.distance,
        total_duration: route.duration,
      },
    });

    res.json({
      request_id: record.id,
      optimized_sequence: optimized,
      total_distance: route.distance,
      total_duration: route.duration,
      map_url: `/api/v1/optimize/${record.id}/map`,
    });
  } catch (error) {
    res.status(500).json({ error: "Optimization failed" });
  }
};

export const getOptimization = async (req: Request, res: Response) => {
  const data = await prisma.optimizationRequest.findUnique({
    where: { id: req.params.id },
  });

  res.json(data);
};