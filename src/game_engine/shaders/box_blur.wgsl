@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var mySampler: sampler;

const n: i32 = 1;
const kernelSize: i32 = 2 * n + 1;

@fragment
fn fragment_main(@location(0) fragTexCoord: vec2<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(sceneTexture));
    let search_width = 1.0 / texSize.x;
    let search_height = 1.0 / texSize.y;

    var colorSum: vec4<f32> = vec4<f32>(0.0);

    for (var y: i32 = -n; y <= n; y = y + 1) {//i = [-n, n]
        for (var x: i32 = -n; x <= n; x = x + 1) {
            let off : vec2<f32> = vec2<f32>(f32(x) * search_width, f32(y) * search_height);
            colorSum = colorSum + textureSample(sceneTexture, mySampler, fragTexCoord + off);
        }
    }
    let averageColor = colorSum / f32(kernelSize * kernelSize); //box blur
    return averageColor;
}
