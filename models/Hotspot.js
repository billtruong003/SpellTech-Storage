const mongoose = require('mongoose');

const HotspotSchema = new mongoose.Schema({
    model_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Model',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    position: {
        type: String,
        required: true
    },
    normal: {
        type: String
    },
    surface: {
        type: String
    },
    content: {
        type: String
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Hotspot', HotspotSchema); 