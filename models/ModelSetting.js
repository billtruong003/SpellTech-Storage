const mongoose = require('mongoose');

const ModelSettingSchema = new mongoose.Schema({
    model_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Model',
        required: true
    },
    camera_orbit: {
        type: String
    },
    camera_target: {
        type: String
    },
    field_of_view: {
        type: String
    },
    exposure: {
        type: String
    },
    shadow_intensity: {
        type: String
    },
    shadow_softness: {
        type: String
    },
    environment_image: {
        type: String
    },
    skybox_image: {
        type: String
    },
    animation_name: {
        type: String
    },
    autoplay: {
        type: Boolean,
        default: false
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

// Update the updated_at field before saving
ModelSettingSchema.pre('save', function (next) {
    this.updated_at = Date.now();
    next();
});

module.exports = mongoose.model('ModelSetting', ModelSettingSchema); 