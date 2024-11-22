struct TextureData {
    x_position: f32,
    y_position: f32,
    x_scale: f32,
    y_scale: f32
};

@group(0) @binding(0) var scene_texure: texture_2d<f32>;
@group(0) @binding(1) var scene_texure_sampler: sampler;
@group(1) @binding(0) var drawing_texture: texture_2d<f32>;
@group(1) @binding(1) var drawing_texture_sampler: sampler;
@group(1) @binding(2) var<uniform> drawing_texture_data: TextureData;

@fragment
fn main(@builtin(position) fragment_coords: vec4<f32>) -> @location(0) vec4<f32> {
    let scene_texture_size = vec2<f32>(textureDimensions(scene_texure));
    let uv = fragment_coords.xy / scene_texture_size;
    var scene_color = textureSample(scene_texure, scene_texure_sampler, uv);

    //UV COORDINATES WHERE TO DRAW THE TEXTURE
    let drawing_texture_size = vec2<f32>(textureDimensions(drawing_texture));


    let d_tex_left = drawing_texture_data.x_position;
    let d_tex_top = drawing_texture_data.y_position;
    let d_tex_right = d_tex_left + (drawing_texture_size.x / scene_texture_size.x) * drawing_texture_data.x_scale;
    let d_tex_bottom = d_tex_top + (drawing_texture_size.y / scene_texture_size.y) * drawing_texture_data.y_scale;
    
    //UV COORDS OF WHICH PIXEL ON TEXTURE TO SAMPLE
    var texture_uv: vec2<f32> = vec2<f32>(
        (uv.x - drawing_texture_data.x_position) * scene_texture_size.x / (drawing_texture_size.x * drawing_texture_data.x_scale), 
        (uv.y - drawing_texture_data.y_position) * scene_texture_size.y / (drawing_texture_size.y * drawing_texture_data.y_scale)
    );
    let tmp_color = textureSample(drawing_texture, drawing_texture_sampler, texture_uv);
    var texture_color = vec4<f32>(0.0, 0.0, 0.0, 0.0); //fully transparent
    //OUTPUT RIGHT TEXTURE COLOR
    if (uv.x >= d_tex_left && 
        uv.x <= d_tex_right &&
        uv.y <= d_tex_bottom &&
        uv.y >= d_tex_top
    ) {
        texture_color = tmp_color;
    }
    //interpolate the colors

    let a1 = texture_color.w;
    let a2 = scene_color.w;
    let out_alpha = a1 + a2 * (1.0 - a1);

    var out_rgb = (texture_color.rgb * a1 + scene_color.rgb * a2 * (1.0 - a1));
    if (out_alpha > 0.0){
        out_rgb = out_rgb / out_alpha;
    }

    return vec4<f32>(out_rgb, out_alpha);
}
