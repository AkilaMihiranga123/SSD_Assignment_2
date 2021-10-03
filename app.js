const express = require("express");

const port = 5000;
const app = express();

// app run on port 5000
app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});