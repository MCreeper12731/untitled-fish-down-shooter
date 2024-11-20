@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var mySampler: sampler;

const N: f32 = 3;
const kernel: array<f32, 2*N + 1> = array<f32, 2*N + 1>(
    0.01830091, 0.14863382,  0.33306527, 0, -0.33306527, -0.14863382, -0.01830091
);

@fragment
fn fragment_main(@location(0) fragTexCoord: vec2<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(sceneTexture));
    let search_width = 1.0 / texSize.x;
    let search_height = 1.0 / texSize.y;

    var colorSum: vec4<f32> = vec4<f32>(0.0);

    for (var i: f32 = -N; y <= N; i = i+1){
        let off : vec2<f32> = vec2<f32>(f32(i) * search_width, f32(i) * search_height);
        colorSum = colorSum + textureSample(sceneTexture, mySampler, fragTexCoord + off);
    }


    var colorSum: vec4<f32> = vec4<f32>(0.0);

    for (var y: i32 = -n; y <= n; y = y + 1) {//i = [-n, n]
        for (var x: i32 = -n; x <= n; x = x + 1) {
            let off : vec2<f32> = vec2<f32>(f32(x) * search_width, f32(y) * search_height);
            
        }
    }
    let averageColor = colorSum / f32(kernelSize * kernelSize); //box blur
    return averageColor;
}
