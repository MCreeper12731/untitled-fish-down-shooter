import * as WebGPU from 'engine/WebGPU.js';
import { loadResources } from 'engine/loaders/resources.js';
import { ImageLoader } from 'engine/loaders/ImageLoader.js';

export class UIRenderer {

    constructor(main_renderer_ref){
        this.main_renderer = main_renderer_ref;
        this.device = this.main_renderer.device;

        this.progress_bar_path = 'assets/UI/redstone_block.png';

        this.progressBarData = new Float32Array([
            0.6,   //progress
            0.4,   // Full width (normalized to 1.0 screen width)
            0.008,  // Bar height (normalized to 1.0 screen height)
            0.5,   //horizontal position (the middle of the bar)
            0.04,  // Vertical position (top of the screen, slightly inset)

        ]);
    }

    async init(){
        this.image_loader = new ImageLoader();

        this.progress_bar_texture = await this.loadTexture(this.progress_bar_path);

        this.vertex_module = this.main_renderer.postprocess_vertex_module;

        this.bar_module = this.device.createShaderModule({ 
            code: await fetch('game_engine/shaders/render_progress_bar.wgsl').then(response => response.text())
        });

        this.progressBarBuffer = this.device.createBuffer({
            size: this.progressBarData.byteLength, // Buffer size in bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, // Allow updates from CPU
        });

        this.renderBindGroupLayout = this.device.createBindGroupLayout({
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
                    binding: 2, // Border texture
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float', viewDimension: '2d' },
                },
                {
                    binding: 3, // Border sampler
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: 'filtering' },
                },
            ],
        });

        this.progressBarBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0, // Matches the `@binding(0)` in WGSL
                    visibility: GPUShaderStage.FRAGMENT, // Used in the fragment shader
                    buffer: { type: 'uniform' }, // Specify it's a uniform buffer
                },
            ],
        });

        this.pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.renderBindGroupLayout, this.progressBarBindGroupLayout],
        });

    }

    drawUI(game_ref){
        if (game_ref.displaying_progress == true){
            this.progressBarData[0] = 1.0 - game_ref.wave_progress;
            this.drawProgressBar(this.main_renderer.cur_texture_buffer, this.main_renderer.next_texture_buffer);
            this.main_renderer.switch_texture_buffers();
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

    drawProgressBar(renderTexture, outputTexture){
        const pipeline = this.device.createRenderPipeline({
            layout: this.pipelineLayout,
            vertex: {
                module: this.vertex_module,
                entryPoint: 'vertex_main',
            },
            fragment: {
                module: this.bar_module,
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

        const progressBarBindGroup = this.device.createBindGroup({
            layout: this.progressBarBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.progressBarBuffer,
                    },
                },
            ],
        });

        const renderBindGroup = this.device.createBindGroup({
            layout: this.renderBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: renderTexture.createView(),
                },
                {
                    binding: 1,
                    resource: this.main_renderer.nearestSampler,
                },
                {
                    binding: 2,
                    resource: this.progress_bar_texture.createView(),
                },
                {
                    binding: 3,
                    resource: this.main_renderer.nearestSampler,
                }
            ],
        });

        const renderPassDescriptor = {
            colorAttachments: [
                {
                    view: outputTexture.createView(), // Output to the canvas
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: { r: 0, g: 0, b: 0, a: 1 }, // Clear color
                },
            ],
        };

        this.device.queue.writeBuffer(this.progressBarBuffer, 0, this.progressBarData);

        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, renderBindGroup);
        passEncoder.setBindGroup(1, progressBarBindGroup);

        passEncoder.draw(6, 1, 0, 0);
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

}