const express=require('express');
const db=require("./config/db");
const app=express();

app.use(express.json());

app.get("/",(req,res)=>{
    res.send("DealiFy API Is Running");
});

const port=process.env.PORT||5000;

app.listen(port,()=>{
    console.log("server is running on port- "+port);
    console.log("open server-: " + "http://localhost:"+port);
});