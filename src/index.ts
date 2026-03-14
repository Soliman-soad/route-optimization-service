import express from "express"
import dotenv from "dotenv"

dotenv.config()

const app = express()
app.use(express.json())


app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        uptime_s: process.uptime()
    })
})

app.listen(3000, () => {
    console.log("Server running on port 3000")
})