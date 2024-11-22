
struct ProgressBar { //all normalized in UV space
    progress: f32,
    width: f32,
    height: f32,
    x_position: f32,
    y_position: f32
};

@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var textsampler: sampler;
@group(1) @binding(0) var<uniform> progressBar: ProgressBar;

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(sceneTexture));
    let uv = fragCoord.xy / texSize;
    var color = textureSample(sceneTexture, textsampler, uv);

    let barLeft = progressBar.x_position;
    let barRight = barLeft + progressBar.width;
    let barBottom = progressBar.y_position;
    let barTop = barBottom + progressBar.height;

    if (uv.x >= barLeft && uv.x <= barRight && uv.y >= barBottom && uv.y <= barTop && uv.x <= (barLeft + progressBar.width * progressBar.progress)) {
        color = vec4<f32>(0.9, 0.1, 0.1, 0.3); //filled
    } else if (uv.x >= barLeft && uv.x <= barRight && uv.y >= barBottom && uv.y <= barTop){
        color = vec4<f32>(0.5, 0.5, 0.5, 0.3); //background
    }

    return color;
}
