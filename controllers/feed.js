const fs = require('fs');
const path = require('path');

const { validationResult } = require('express-validator');
const ffmpeg = require('fluent-ffmpeg');
const ffmpeg_static = require('ffmpeg-static');
const probe = require('node-ffprobe')
const gm = require('gm');
var im = require('imagemagick');
var imageMagick = gm.subClass({ imageMagick: true });
var ObjectId = require('mongoose').Types.ObjectId;

const io = require('../socket');
const Post = require('../models/post.js');
const User = require('../models/user');

exports.getPosts = async (req, res, next) => {
    // console.log(req.query);
    const currentPage = req.query.page || 1;
    const perPage = 2;
    let totalItems;
    let posts

    if (req.query.userpost) {
        try {
            totalItems = await Post.find().countDocuments()
            posts = await Post.find()
                .populate('creator')
                .sort({ createdAt: -1 })
                // .skip((currentPage - 1) * perPage)
                // .limit(perPage);
    
            res.status(200).json({
                message: 'Fetched posts successfully.',
                posts: posts,
                totalItems: totalItems
            });
        } catch (err) {
            if (!err.statusCode) {
                err.statusCode = 500;
            }
            next(err);
            }
        } else {

            try {
                totalItems = await Post.find().countDocuments()
                posts = await Post.find()
                    .populate('creator')
                    .sort({ createdAt: -1 })
                    .skip((currentPage - 1) * perPage)
                    .limit(perPage);
        
                res.status(200).json({
                    message: 'Fetched posts successfully.',
                    posts: posts,
                    totalItems: totalItems
                });
            } catch (err) {
                if (!err.statusCode) {
                    err.statusCode = 500;
                }
                next(err);
            }
        }

}

exports.createPost = async (req, res, next) => {
    // console.log('req.body',req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, entered data incorrect.');
        error.statusCode = 422;
        throw error;
    }

    if (!req.file) {
        res.status(422).json({ message: 'file is unacceptable file type or not exits'});
        // const error = new Error('No image provided');
        // error.statusCode = 422;
        // throw error;
    }

    const imageUrl = req.file.path;
    const title = req.body.title;
    const content = req.body.content;
    const b64Simage = req.body.b64Simage;
    const public = req.body.public;
    let creator;

    const imageUrlArray = imageUrl.split('.');
    const fileType = imageUrlArray.pop();
    const withoutFileType = imageUrlArray.join('');
    const modifiedImageUrl = withoutFileType + '-modify.' + fileType;
    // console.log(modifiedImageUrl);

    const ForFile = imageUrl.split('/')[1];
    const ForFileArray = ForFile.split('.');
    const forFileFileType = ForFileArray.pop();
    const forFileWithoutFileType = ForFileArray.join('');
    const forFileFileName = forFileWithoutFileType + '.webp';
    const thumbnailImageUrl = 'images/' + forFileFileName;

    const fileMimetype = req.file.mimetype.split('/')[0];
    if (fileMimetype === 'image') {
        const smallImage = await createSmallImage(imageUrl, modifiedImageUrl);
    }
    if (fileMimetype === 'video') {
        const trimedVideo = await trimVideo(imageUrl, modifiedImageUrl);
        const thumbnail = await createThumbnail(imageUrl, forFileFileName);
    }

    // create post in db
    const post = new Post({
        title: title,
        content: content,
        imageUrl: imageUrl,
        modifiedImageUrl: modifiedImageUrl,
        thumbnailImageUrl: thumbnailImageUrl,
        creator: req.userId,
        b64Simage: b64Simage,
        public: public,
    });
    try {
        await post.save()
        const user = await User.findById(req.userId);
        user.posts.push(post);
        await user.save()
        io.getIO().emit('posts', {
             action: 'create', 
             post: {...post._doc, creator: { _id: req.userId, name: user.name } } 
        });
        res.status(201).json({
            message: 'Post created Successfully',
            post: post,
            creator: { _id: user._id, name: user.name }
        })
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    };

}

exports.getPost = async (req, res, next) => {
    const postId = req.params.postId;
    const post = await Post.findById(postId)
    try {
        if (!post) {
            const error = new Error('Could not find post.');
            error.statusCode = 404;
            throw error;
        }
        res.status(200).json({ message: 'Post fetched.', post: post });
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.updatePost = async (req, res, next) => {
    
    console.log('req.body', req.body, 'req.file', req.file);

    const postId = req.params.postId;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, entered data incorrect.');
        error.statusCode = 422;
        throw error;
    }

    const title = req.body.title;
    const content = req.body.content;
    let imageUrl = req.body.image;
    const b64Simage = req.body.b64Simage;
    const public = req.body.public;

    console.log('imageUrl', imageUrl);
    let fileMimetype;
    if (req.file) {
        imageUrl = req.file.path;
        fileMimetype = req.file.mimetype.split('/')[0];
    }
    if (!imageUrl) {
        const error = new Error('No file picked.');
        error.statusCode = 422;
        throw error;
    }

    // console.log('imageUrl', imageUrl);
    const imageUrlArray = imageUrl.split('.');
    const fileType = imageUrlArray.pop();
    const withoutFileType = imageUrlArray.join('');
    const modifiedImageUrl = withoutFileType + '-modify.' + fileType;
    
    // console.log('imageUrl for filename ',imageUrl);
    const ForFile = imageUrl.split('/')[1];
    const ForFileArray = ForFile.split('.');
    const forFileFileType = ForFileArray.pop();
    const forFileWithoutFileType = ForFileArray.join('');
    const forFileFileName = forFileWithoutFileType + '.webp';
    const thumbnailImageUrl = 'images/' + forFileFileName;
    // console.log('filename without type? ', forFileWithoutFileType);

    if (fileMimetype === 'image') {
        const smallImage = await createSmallImage(imageUrl, modifiedImageUrl);
    }
    if (fileMimetype === 'video') {
        const trimedVideo = await trimVideo(imageUrl, modifiedImageUrl);
        const thumbnail = await createThumbnail(imageUrl, forFileFileName);
    }

    // probe(imageUrl).then(probeData => {
    //     console.log('probeData ',probeData)
    // })

    try {
        const post = await Post.findById(postId).populate('creator');
        // console.log('post', post);
        if (!post) {
            const error = new Error('Could not find post.');
            error.statusCode = 404;
            throw error;
        }
        if (post.creator._id.toString() !== req.userId) {
            const error = new Error('not authorized!');
            error.statusCode = 403;
            throw error;
        }
        if (imageUrl !== post.imageUrl) {
            clearImage(post.imageUrl);
            clearImage(post.modifiedImageUrl);
            if (fileMimetype === 'video') {
                clearImage(post.thumbnailImageUrl);
            }
        }

        // console.log('imageUrls', imageUrl, post.imageUrl);
        post.title = title;
        post.imageUrl = imageUrl;
        post.content = content;
        post.b64Simage = b64Simage;
        post.modifiedImageUrl = modifiedImageUrl;
        post.thumbnailImageUrl = thumbnailImageUrl;
        post.public = public;

        const result = await post.save();

        io.getIO().emit('posts', { action: 'update', post: result });
        res.status(200).json({ message: 'Post updated', post: result });
    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }

}

exports.deletePost = async (req, res, next) => {
    const postId = req.params.postId;

    try {
        const post = await Post.findById(postId)

        // check login user
        if (!post) {
            const error = new Error('Could not find post.');
            error.statusCode = 404;
            throw error;
        }
        if (post.creator.toString() !== req.userId) {
            const error = new Error('not authorized!');
            error.statusCode = 403;
            throw error;
        }

        const imageUrlArray = post.imageUrl.split('.');
        const fileType = imageUrlArray.pop();

        clearImage(post.imageUrl);
        clearImage(post.modifiedImageUrl);
        if (fileType === 'mp4' || fileType === 'webm') {
            clearImage(post.thumbnailImageUrl);
        }

        await Post.findByIdAndRemove(postId);

        const user = await User.findById(req.userId);

        user.posts.pull(postId);
        await user.save();
        io.getIO().emit('posts', { action: 'delete', post: postId });

        res.status(200).json({ message: 'Deleted post.' });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
}

const clearImage = filePath => {
    filePath = path.join(__dirname, '..', filePath);
    fs.unlink(filePath, err => console.log(err));
}

const createSmallImage = (imageUrl, modifiedImageUrl) => {
    return new Promise((resolve, reject) => {
        gm(imageUrl)
        .resize(100, 100)
        // .noProfile()
        .write(modifiedImageUrl, function (err) {
            if (err) {
                console.log('error occured ', err);
                reject({ message: "error occured " + err });
            }
            if (!err) {
                console.log('done making small image')
                resolve({message: "done making small image"})
                // console.log('done');
                // gm(modifiedImageUrl)
                //     .identify(function (err, data) {
                    //         if (err) console.log(err);
                    //         // if (!err) console.log('DATA:',data);
                    
                    //     });
                }
        });
    })
} 

const trimVideo = (imageUrl, modifiedImageUrl) => {
    return new Promise((resolve, reject) => {
        ffmpeg(imageUrl)
        .setFfmpegPath(ffmpeg_static)
        .setStartTime('00:00:01') //Can be in "HH:MM:SS" format also
        .setDuration(3) 
        .size("50x?").autopad()
        .on("start", function(commandLine) {
            console.log("Spawned FFmpeg with command: " + commandLine);
        })
        .on('codecData', function(data) {
            console.log('Input is ' + data.audio_details + ' AUDIO ' +
            'WITH ' + data.video_details + ' VIDEO');
        })
        .on("error", function(err) {
            console.log("error: ", err);
            reject({ message: "error occured " + err });
        })
        .on("end", function(err) {
            if (!err) {
                console.log("video trim conversion Done");
                resolve({message: 'video trim conversion Done'})
            }
        })
        .saveToFile(modifiedImageUrl);
    
    })
} 

const createThumbnail = (imageUrl, filename) => {
    return new Promise((resolve, reject) => {
        ffmpeg(imageUrl)
            // setup event handlers
            // .on('filenames', function(filename) {
            //     console.log('screenshots are ' + filenames.join(', '));
            // })
            .on('end', function() {
                console.log('screenshots were saved');
                resolve({ message: 'screenshots were saved' })
            })
            .on('error', function(err) {
                console.log('an error happened: ' + err.message);
                reject({ message: "error occured " + err });
            })
            // take 2 screenshots at predefined timemarks and size
            .takeScreenshots({
                 count: 1, 
                 filename: filename,
                 timemarks: ['50%'], 
                 size: '?x100' 
                }, './images');
    })
}

    // var CreateSmallImage = gm(imageUrl)
    //     .resize(50, 50)
    //     // .noProfile()
    //     .write(modifiedImageUrl, function (err) {
    //         if (err) {console.log(err);}
    //         if (!err) {
    //             // console.log('done');
    //             // gm(modifiedImageUrl)
    //             //     .identify(function (err, data) {
    //                 //         if (err) console.log(err);
    //                 //         // if (!err) console.log('DATA:',data);
                    
    //                 //     });
    //             }
    //     });
        
    // var trimVideo = ffmpeg(imageUrl)
    //     .setFfmpegPath(ffmpeg_static)
    //     .setStartTime('00:00:01') //Can be in "HH:MM:SS" format also
    //     .setDuration(3) 
    //     .size("50x?").autopad()
    //     .on("start", function(commandLine) {
    //         console.log("Spawned FFmpeg with command: " + commandLine);
    //     })
    //     .on('codecData', function(data) {
    //         console.log('Input is ' + data.audio_details + ' AUDIO ' +
    //         'WITH ' + data.video_details + ' VIDEO');
    //     })
    //     .on("error", function(err) {
    //         console.log("error: ", err);
    //     })
    //     .on("end", function(err) {
    //         if (!err) {
    //             console.log("conversion Done");
    //         }
    //     })
    //     .saveToFile(modifiedImageUrl);
        
        // gm(imageUrl)
        //     .size(function (err, size) {
        //         if (err) {
        //             console.log(err);
        //         }
        //         if (!err) {
        //             console.log('size', size);
        //         console.log(size.width > size.height ? 'wider' : 'taller than you');
        //     }
        // });

        // im.identify(imageUrl, function(err, features){
    //     if (err) throw err;
    //     console.log('features', features);
    //   })

    // const imageUrlArray = imageUrl.split('.');
    // const fileType = imageUrlArray.pop();
    // const withoutFileType = imageUrlArray.join('');
    // const modifiedImageUrl = withoutFileType + '-modify.' + fileType 
    // console.log('imageUrl ft', fileType);
    // console.log('img',withoutFileType);
    // console.log('mod', modifiedImageUrl);