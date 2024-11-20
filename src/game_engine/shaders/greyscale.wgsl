@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var mySampler: sampler;

@fragment
fn fragment_main(@location(0) fragTexCoord: vec2<f32>) -> @location(0) vec4<f32> {
    let c = textureSample(sceneTexture, mySampler, fragTexCoord);
    let weights= vec3<f32>(0.299, 0.587, 0.114);
    let grey: f32 = dot(c.rgb, weights);
    return vec4<f32>(grey, grey, grey, c.a);

}
