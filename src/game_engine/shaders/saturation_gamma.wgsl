@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var mySampler: sampler;

@fragment
fn fragment_main(@location(0) fragTexCoord: vec2<f32>) -> @location(0) vec4<f32> {
    var saturation_boost = 1.2;
    var gamma = 0.9; // > 1 => make darks darker OR < 1 => make darks lighter

    let color = textureSample(sceneTexture, mySampler, fragTexCoord);
    let rgb = color.rgb;

    //saturation boost
    let luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    let gray = vec3<f32>(luminance);
    let sat_tmp = gray + (rgb - gray) * saturation_boost;
    let saturation_adjusted = clamp(sat_tmp, vec3<f32>(0.0), vec3<f32>(1.0));

    //gamma correction
    let gamma_corrected_rgb = pow(saturation_adjusted, vec3<f32>(1.0 / gamma));

    return vec4<f32>(gamma_corrected_rgb, color.a);
}
