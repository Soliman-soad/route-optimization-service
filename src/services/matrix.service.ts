import axios from "axios";

const API_KEY = process.env.ORS_KEY;

export const getMatrix = async (driver: any, stops: any[]) => {
  const locations = [
    [driver.lng, driver.lat],
    ...stops.map((s) => [s.lng, s.lat]),
  ];

  const response = await axios.post(
    "https://api.openrouteservice.org/v2/matrix/driving-car",
    {
      locations,
      metrics: ["distance", "duration"],
    },
    {
      headers: {
        Authorization: API_KEY,
      },
    }
  );

  return response.data.durations;
};