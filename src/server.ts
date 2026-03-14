import express from "express";
import { optimizeRoute } from "./controllers/optimize.controller";



const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

app.use("/api/v1/optimize", optimizeRoute);

app.listen(3000, () => {
    console.log("Server running on port 3000");
});