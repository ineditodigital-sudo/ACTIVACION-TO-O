require('dotenv').config();
const axios = require('axios'); axios.get('https://image.pollinations.ai/prompt/a%20cute%20cat?width=1080&height=1920&nologo=true').then(r=>console.log(r.status)).catch(e=>console.log(e.response.data));
