import * as WebGPU from 'engine/WebGPU.js';
import { loadResources } from 'engine/loaders/resources.js';
import { ImageLoader } from 'engine/loaders/ImageLoader.js';
import { elasticEaseIn, bounceEaseIn, stepEaseIn, polyEaseIn, polyEaseInOut } from 'engine/animators/EasingFunctions.js';

export class UIRenderer {

    constructor(main_renderer_ref, game_ref){
        this.main_renderer = main_renderer_ref;
        this.device = this.main_renderer.device;
        this.game_ref = game_ref;
        this.progress_bar_path = 'assets/UI/progress_bar_texture.png';
        this.weapon_UI_path = [
            'assets/UI/weapon_UI_0_sprite.png',
            'assets/UI/weapon_UI_1_sprite.png',
            'assets/UI/weapon_UI_2_sprite.png',
            'assets/UI/weapon_UI_3_sprite.png',
            'assets/UI/weapon_UI_4_sprite.png',
            'assets/UI/weapon_UI_5_sprite.png',
        ];

        this.game_tip_UI_path = [
            'assets/UI/game_tip_0.png',
        ];

        this.progress_bar_data = new Float32Array([
            0.0,   //progress
            0.0,   // Full width (normalized to 1.0 screen width)
            0.0,  // Bar height (normalized to 1.0 screen height)
            0.0,   //horizontal position (the middle of the bar)
            0.0,  // Vertical position (top of the screen, slightly inset)

        ]);

        this.progress_bar_uv_pos = [0.0, 0.0];
        this.weapon_ui_pos = [0.0, 0.0];


        this.texture_draw_data = new Float32Array([0.0, 0.0, 0.0, 0.0]);
        this.image_loader = new ImageLoader();
    }

    drawUI(){
        this.progress_bar_UI();
        this.weapon_UI();
        this.game_tip_UI();
    }

    async init(){

        await this.loadUITextures();
        
        this.vertex_module = this.main_renderer.postprocess_vertex_module;

        //drawing progress bar pipeline

        this.progress_bar_module = this.device.createShaderModule({ 
            code: await fetch('game_engine/shaders/render_progress_bar.wgsl').then(response => response.text())
        });

        this.progress_bar_buffer = this.device.createBuffer({
            size: this.progress_bar_data.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.scene_texture_render_BGlayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float', viewDimension: '2d' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: 'filtering' },
                }
            ],
        });

        this.progress_bar_BGLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        this.draw_progress_bar_PLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.scene_texture_render_BGlayout, this.progress_bar_BGLayout],
        });
        
        //drawing texture pipeline

        this.texture_draw_module = this.device.createShaderModule({ 
            code: await fetch('game_engine/shaders/draw_texture.wgsl').then(response => response.text())
        });

        this.texture_draw_buffer = this.device.createBuffer({
            size: this.texture_draw_data.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.sampled_texture_BGLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float', viewDimension: '2d' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: 'filtering' },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        this.texture_draw_PLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.scene_texture_render_BGlayout, this.sampled_texture_BGLayout],
        });

        this.reconfigure_ui_positions();
    }

    async loadUITextures(){
        this.progress_bar_border_texture = await this.loadTexture(this.progress_bar_path);
        this.weapon_UI_textures = [];
        for (let i = 0; i < this.weapon_UI_path.length; i++){
            this.weapon_UI_textures[i] = await this.loadTexture(this.weapon_UI_path[i]);
        }
        this.game_tip_UI_textures = [];
        for (let i = 0; i < this.game_tip_UI_path.length; i++){
            this.game_tip_UI_textures[i] = await this.loadTexture(this.game_tip_UI_path[i]);
        }
    }

    async loadTexture(url) {
        const image = await this.image_loader.load(url);
    
        const texture = this.device.createTexture({
            size: [image.width, image.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
    
        this.device.queue.copyExternalImageToTexture(
            { source: image },
            { texture: texture },
            [image.width, image.height]
        );
    
        return texture;
    }

    game_tip_UI(){
        if (this.game_ref.game_tip_enabled == false) return;

        const UI_ind = 0;
        const total_scale = 2;
        const x_offset = 0.015;
        const y_offset = 0.03;

        const game_time = this.game_ref.game_time;
        const duration = this.game_ref.game_tip_animation_duration;
        const game_tip_scale = (game_time < duration ? polyEaseInOut(game_time) : 1) * total_scale;

        const canvas_width = this.main_renderer.canvas.width;
        const canvas_height = this.main_renderer.canvas.height;
        const texture_width_uv = this.game_tip_UI_textures[UI_ind].width / canvas_width;
        const texture_height_uv = this.game_tip_UI_textures[UI_ind].height / canvas_height;

        const x = 0.5 + x_offset;
        const y = 0.5 - texture_height_uv + texture_height_uv * (1 - game_tip_scale) - y_offset;

        this.drawTexture(this.game_tip_UI_textures[0], x, y, game_tip_scale, game_tip_scale);
    }

    weapon_UI(){
        this.drawTexture(this.weapon_UI_textures[this.game_ref.UI_data.weapon_ui_variation], this.weapon_ui_pos[0], this.weapon_ui_pos[1], 5.0, 5.0);
    }

    progress_bar_UI(){
        if (this.game_ref.displaying_progress == true){
            this.drawTexture(this.progress_bar_border_texture, this.progress_bar_uv_pos[0], this.progress_bar_uv_pos[1], 1.0, 1.0);
            this.progress_bar_data[0] = 1.0 - this.game_ref.wave_progress;
            this.drawProgressBar();
        }
    }

    reconfigure_ui_positions(){
        const canvas_texture = this.main_renderer.cur_texture_buffer;
        const canvas_tex_width = canvas_texture.width;
        const canvas_tex_height = canvas_texture.height;

        const pb_tex_width = this.progress_bar_border_texture.width; 
        const pb_tex_height = this.progress_bar_border_texture.height;

        const pb_UV_width = pb_tex_width / canvas_tex_width;
        const pb_UV_height = pb_tex_height / canvas_tex_height;

        const pb_pixel_thickness = 4.0;
        const pb_UV_offset = pb_pixel_thickness / (canvas_tex_width > canvas_tex_height ? canvas_tex_width : canvas_tex_height);

        this.progress_bar_uv_pos[0] = this.game_ref.UI_data.progress_bar_pos_x - pb_UV_width / 2;
        this.progress_bar_uv_pos[1] = this.game_ref.UI_data.progress_bar_pos_y;

        this.progress_bar_data[1] = pb_UV_width - 2 * pb_UV_offset;
        this.progress_bar_data[2] = pb_UV_height - 2 * pb_UV_offset;
        this.progress_bar_data[3] = this.progress_bar_uv_pos[0] + pb_UV_offset; 
        this.progress_bar_data[4] = this.progress_bar_uv_pos[1] + pb_UV_offset;

        this.weapon_ui_pos[0] = this.game_ref.UI_data.weapon_ui_pos_x;
        this.weapon_ui_pos[1] = this.game_ref.UI_data.weapon_ui_pos_y;
    }

    drawProgressBar(){
        const renderTexture = this.main_renderer.cur_texture_buffer;
        const outputTexture = this.main_renderer.next_texture_buffer;

        const pipeline = this.device.createRenderPipeline({
            layout: this.draw_progress_bar_PLayout,
            vertex: {
                module: this.vertex_module,
                entryPoint: 'vertex_main',
            },
            fragment: {
                module: this.progress_bar_module,
                entryPoint: 'main',
                targets: [
                    {
                        format: this.main_renderer.format,
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });


        const scene_texture_render_BG = this.device.createBindGroup({
            layout: this.scene_texture_render_BGlayout,
            entries: [
                {
                    binding: 0,
                    resource: renderTexture.createView(),
                },
                {
                    binding: 1,
                    resource: this.main_renderer.nearestSampler,
                }
            ],
        });

        const progress_bar_BG = this.device.createBindGroup({
            layout: this.progress_bar_BGLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.progress_bar_buffer,
                    },
                },
            ],
        });

        const pass_descriptor = {
            colorAttachments: [
                {
                    view: outputTexture.createView(),
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                },
            ],
        };

        this.device.queue.writeBuffer(this.progress_bar_buffer, 0, this.progress_bar_data);

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass(pass_descriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, scene_texture_render_BG);
        pass.setBindGroup(1, progress_bar_BG);
        pass.draw(6, 1, 0, 0);
        pass.end();
        this.device.queue.submit([encoder.finish()]);

        this.main_renderer.switch_texture_buffers();
    }

    drawTexture(texture, x, y, scale_x, scale_y){
        this.texture_draw_data[0] = x;
        this.texture_draw_data[1] = y;
        this.texture_draw_data[2] = scale_x;
        this.texture_draw_data[3] = scale_y;

        const renderTexture = this.main_renderer.cur_texture_buffer;
        const outputTexture = this.main_renderer.next_texture_buffer;

        const pipeline = this.device.createRenderPipeline({
            layout: this.texture_draw_PLayout,
            vertex: {
                module: this.vertex_module,
                entryPoint: 'vertex_main',
            },
            fragment: {
                module: this.texture_draw_module,
                entryPoint: 'main',
                targets: [
                    {
                        format: this.main_renderer.format,
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });


        const scene_texture_render_BG = this.device.createBindGroup({
            layout: this.scene_texture_render_BGlayout,
            entries: [
                {
                    binding: 0,
                    resource: renderTexture.createView(),
                },
                {
                    binding: 1,
                    resource: this.main_renderer.nearestSampler,
                }
            ],
        });

        const sampled_texture_BG = this.device.createBindGroup({
            layout: this.sampled_texture_BGLayout,
            entries: [
                {
                    binding: 0,
                    resource: texture.createView(),
                },
                {
                    binding: 1,
                    resource: this.main_renderer.nearestSampler,
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.texture_draw_buffer,
                    },
                },
            ],
        });

        const pass_descriptor = {
            colorAttachments: [
                {
                    view: outputTexture.createView(),
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                },
            ],
        };

        this.device.queue.writeBuffer(this.texture_draw_buffer, 0, this.texture_draw_data);

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass(pass_descriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, scene_texture_render_BG);
        pass.setBindGroup(1, sampled_texture_BG);
        pass.draw(6, 1, 0, 0);
        pass.end();
        this.device.queue.submit([encoder.finish()]);

        this.main_renderer.switch_texture_buffers();

    }

}