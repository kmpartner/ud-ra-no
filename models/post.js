const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const postSchema = Schema({
    title: {
        type: String,
        required: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    modifiedImageUrl: {
        type: String,
        // required: true
    },
    thumbnailImageUrl: {
        type: String,
        // required: true
    },
    content: {
        type: String,
        required: true
    },
    creator: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    b64Simage: {
        type: String,
        // required: true
    },
    public: {
        type: Boolean,
        // required: true
    }
}, 
{ timestamps: true }
);

module.exports = mongoose.model('Post', postSchema);