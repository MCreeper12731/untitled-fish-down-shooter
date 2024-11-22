@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var mySampler: sampler;


@fragment
fn fragment_main(@location(0) fragTexCoord: vec2<f32>) -> @location(0) vec4<f32> {
    let color = textureSample(sceneTexture, mySampler, fragTexCoord);
    return vec4(1 - color.rgb, 1.0);
}
