require('dotenv').config();
const axios = require('axios'); axios.get('https://pollinations.ai/p/a%20cute%20cat').then(r=>console.log(r.status)).catch(e=>console.log(e.response ? e.response.status : e.message));
