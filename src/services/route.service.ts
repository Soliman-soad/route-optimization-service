import axios from "axios";

const API_KEY = process.env.ORS_KEY;

export const getRouteGeometry = async (
  driver: any,
  stops: any[],
  order: number[]
) => {
  const coords = [
    [driver.lng, driver.lat],
    ...order.map((i) => [stops[i - 1].lng, stops[i - 1].lat]),
  ];

  const res = await axios.post(
    "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
    {
      coordinates: coords,
    },
    {
      headers: {
        Authorization: API_KEY,
      },
    }
  );

  const feature = res.data.features[0];

  return {
    geometry: feature.geometry,
    distance: feature.properties.summary.distance,
    duration: feature.properties.summary.duration,
  };
};