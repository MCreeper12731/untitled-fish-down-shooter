@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var mySampler: sampler;

@fragment
fn fragment_main(@location(0) fragTexCoord: vec2<f32>) -> @location(0) vec4<f32> {

    let downsample_scale = 2.0;

    let texSize = vec2<f32>(textureDimensions(sceneTexture));
    let dims = texSize / downsample_scale;

    let new_u = floor(fragTexCoord.x * dims.x) / dims.x;
    let new_v = floor(fragTexCoord.y * dims.y) / dims.y;
    let new_uv = vec2<f32>(new_u, new_v);

    return textureSample(sceneTexture, mySampler, new_uv);


}
