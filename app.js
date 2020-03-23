const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');

require('dotenv').config()

const feedRoutes = require('./routes/feed');
const authRoutes = require('./routes/auth');

const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'images');
    },
    filename: (req, file, cb) => {
        cb(null, new Date().toISOString() + '-' + file.originalname);
    }

});

const fileFilter = (req, file, cb) => {
    if (
        file.mimetype === 'image/png' ||
        file.mimetype === 'image/jpg' ||
        file.mimetype === 'image/jpeg' || 
        file.mimetype === 'image/webp' ||
        file.mimetype === 'video/mp4' ||
        file.mimetype === 'video/webm' 
    ) {
        cb(null, true);
    } else {
        cb(null, false);
    }
}

const multerLimits = { fileSize: 1024 * 1024 * 3 };

const app = express();

app.use(bodyParser.json()); //application/json

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization' );
    next();
})

app.use(multer({ 
        storage: fileStorage, 
        limits: multerLimits, 
        fileFilter: fileFilter}).single('image')
);

app.use('/images', express.static(path.join(__dirname, 'images')));

app.use('/feed', feedRoutes);
app.use('/auth', authRoutes);

//// test /xxx
app.use('/xxx', (req, res, next) => {
  console.log('in /xxx');
  res.send('<h1>Hello from Express /xxx </h1>')
})

app.use('/healthz', (req, res, next) => {
    console.log('in /healthz');
    res.send('<h3> /healthz </h3>')
  })

app.use((error, req, res, next) => {
    console.log(error);
    const status = error.statusCode || 500;
    const message = error.message;
    const data = error.data;
    res.status(status).json({ message: message, data: data })
})

// console.log('user', process.env.MONGO_USERNAME);
mongoose.connect(
    `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster0-t2qe0.mongodb.net/${process.env.MONGO_DB}?retryWrites=true&w=majority`
)
.then(result => {
    // app.listen(8080);
    const server = app.listen(8083);
    const io = require('./socket').init(server);
    io.on('connection', socket => {
        console.log('Client connected');
    })
})
.catch(err => console.log(err));


// ----

// const express = require('express');
// const app = express();
const router = express.Router();
// const db = require('./db');
const sharks = require('./routes/sharks');

const sharkPath = __dirname + '/views/';
const port = process.env.PORT || 8084;

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(express.urlencoded({ extended: true }));
app.use(express.static(sharkPath));
// app.use('/sharks', sharks);

// app.listen(port, function () {
//   console.log(`Example app listening on ${port}!`)
// })
