const express=require('express');
const db=require("./config/db");
const dotenv=require("dotenv");
const authRoutes=require("./routes/authRoutes");

dotenv.config();


const app=express();

app.use(express.json());
app.use("/api/auth",authRoutes);

app.get("/",(req,res)=>{
    res.send("DealiFy API Is Running");
});

const port=process.env.PORT||5000;

app.listen(port,()=>{
    console.log("server is running on port- "+port);
    console.log("open server-: " + "http://localhost:"+port);
});