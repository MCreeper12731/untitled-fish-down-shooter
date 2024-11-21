
struct ProgressBar { //all normalized in UV space
    progress: f32,
    width: f32,
    height: f32,
    x_position: f32,
    y_position: f32
};

@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var textsampler: sampler;
@group(0) @binding(2) var borderTexture: texture_2d<f32>; // Border texture
@group(0) @binding(3) var borderSampler: sampler;         // Border sampler
@group(1) @binding(0) var<uniform> progressBar: ProgressBar;

@fragment
fn main(@builtin(position) fragment_coords: vec4<f32>) -> @location(0) vec4<f32> {
    let scene_texture_size = vec2<f32>(textureDimensions(sceneTexture));
    let uv = fragment_coords.xy / scene_texture_size;
    var ouput_color = textureSample(sceneTexture, textsampler, uv);

    //UV COORDINATES WHERE TO DRAW THE TEXTURE
    let bar_texture_size = vec2<f32>(textureDimensions(borderTexture));


    var texture_draw_offset: vec2<f32> = vec2<f32>(0.1, 0.1);

    let bar_texture_left = texture_draw_offset.x;
    let bar_texture_top = texture_draw_offset.y;
    let bar_texture_right = bar_texture_left + bar_texture_size.x / scene_texture_size.x;
    let bar_texture_bottom = bar_texture_top + bar_texture_size.y / scene_texture_size.y;
    
    //RELATIVE SAMPLING UVS FOR TEXTURE (cant sample the 2 textures at same UV if you want them to draw nicely)
    var texture_uv: vec2<f32> = vec2<f32>(
        (uv.x - texture_draw_offset.x) * scene_texture_size.x / bar_texture_size.x, 
        (uv.y - texture_draw_offset.y) * scene_texture_size.y / bar_texture_size.y
    );

    let border_texture_color = textureSample(borderTexture, borderSampler, texture_uv);

    //draw over scene texture if UV coords are in right place
    if (uv.x >= bar_texture_left && 
        uv.x <= bar_texture_right &&
        uv.y <= bar_texture_bottom &&
        uv.y >= bar_texture_top
    ) {
        ouput_color = border_texture_color;
    }


    /*
    //bar positions in texture UV space
    let bar_left = progressBar.x_position - progressBar.width / 2;
    let bar_right = bar_left + progressBar.width;
    let bar_bottom = progressBar.y_position;
    let bar_top = bar_bottom + progressBar.height;

    // Draw border
    let border_texture_y_thickness= 5.0 / scene_texture_size.y; // border thickness in UV
    let border_texture_x_thickness = 5.0 / scene_texture_size.x;
 
    if (uv.x >= bar_left - border_texture_x_thickness && 
        uv.x <= bar_right + border_texture_x_thickness &&
        uv.y >= bar_bottom - border_texture_y_thickness && 
        uv.y <= bar_top + border_texture_y_thickness &&
        !(uv.x >= bar_left && uv.x <= bar_right && uv.y >= bar_bottom && uv.y <= bar_top)) {
            ouput_color = border_texture_color;
    }

    // Draw progress bar
    if (uv.x >= bar_left && uv.x <= bar_right && uv.y >= bar_bottom && uv.y <= bar_top) {
        ouput_color = vec4<f32>(0.2, 0.6, 0.8, 1.0);
    }
    */
    

    return ouput_color;
}
