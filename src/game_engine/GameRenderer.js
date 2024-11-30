import { vec3, mat4 } from 'glm';

import * as WebGPU from 'engine/WebGPU.js';

import { Camera } from 'engine/core.js';
import { BaseRenderer } from 'engine/renderers/BaseRenderer.js';
import * as MipMaps from 'engine/WebGPUMipmaps.js';

import {
    getLocalModelMatrix,
    getGlobalModelMatrix,
    getGlobalViewMatrix,
    getProjectionMatrix,
    getModels,
} from 'engine/core/SceneUtils.js';

import { Light } from './Light.js';
import { createTextureFromSource } from '../../engine/WebGPU.js';
import { UIRenderer } from './UIRenderer.js';

const vertexBufferLayout = {
    arrayStride: 32,
    attributes: [
        {
            name: 'position',
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
        },
        {
            name: 'texcoords',
            shaderLocation: 1,
            offset: 12,
            format: 'float32x2',
        },
        {
            name: 'normal',
            shaderLocation: 2,
            offset: 20,
            format: 'float32x3',
        },
    ],
};

export class GameRenderer extends BaseRenderer {

    constructor(canvas, game_ref) {
        super(canvas);
        this.game_ref = game_ref;
    }

    render(scene, camera, game_ref) {
        if (this.depthTexture.width !== this.canvas.width || this.depthTexture.height !== this.canvas.height
         || this.interTexture1.width !== this.canvas.width || this.interTexture1.height !== this.canvas.height
         || this.interTexture2.width !== this.canvas.width || this.interTexture2.height !== this.canvas.height
        ) {
            this.recreateShaderTextures();
            this.UIRenderer.reconfigure_ui_positions();
        }
        //scene rendering
        this.renderShadows(scene);
        this.renderColor(scene, camera, this.cur_texture_buffer);
        //post processing
        //this.renderPostProcessingEffect(this.greyscale, this.nearestSampler, this.interTexture1, this.interTexture2);
        //this.renderPostProcessingEffect(this.negative, this.nearestSampler, this.cur_texture_buffer, this.next_texture_buffer);
        this.renderPostProcessingEffect(this.downsample, this.linearSampler, this.cur_texture_buffer, this.next_texture_buffer);
        //UI drawing
        this.UIRenderer.drawUI(game_ref, this.cur_texture_buffer, this.next_texture_buffer);

        this.renderPostProcessingEffect(this.just_output, this.nearestSampler, this.cur_texture_buffer, this.context.getCurrentTexture());
        
    }

    switch_texture_buffers(){
        const n = this.cur_texture_buffer;
        this.cur_texture_buffer = this.next_texture_buffer;
        this.next_texture_buffer = n;
    }

    async initialize() {
        await super.initialize();

        const colorPassCode = await fetch('game_engine/shaders/colorPass.wgsl').then(response => response.text());
        const colorPassModule = this.device.createShaderModule({ code: colorPassCode });

        const shadowPassCode = await fetch('game_engine/shaders/shadowPass.wgsl').then(response => response.text());
        const shadowPassModule = this.device.createShaderModule({ code: shadowPassCode });

        await this.setupPostProcessingShaders();
        
        this.UIRenderer = new UIRenderer(this, this.game_ref);
        
        this.modelBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
            ],
        });

        this.cameraBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
            ],
        });

        this.lightBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'depth' },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: 'comparison' },
                },
            ],
        });

        this.materialBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
            ],
        });

        this.pipeline = await this.device.createRenderPipelineAsync({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.cameraBindGroupLayout,
                    this.modelBindGroupLayout,
                    this.materialBindGroupLayout,
                    this.lightBindGroupLayout,
                ],
            }),
            vertex: {
                module: colorPassModule,
                buffers: [ vertexBufferLayout ],
            },
            fragment: {
                module: colorPassModule,
                targets: [{ format: this.format }],
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
        });

        this.shadowPipeline = await this.device.createRenderPipelineAsync({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.cameraBindGroupLayout,
                    this.modelBindGroupLayout,
                ],
            }),
            vertex: {
                module: shadowPassModule,
                buffers: [ vertexBufferLayout ],
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
        });

        this.nearestSampler = this.device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest',
        });

        this.linearSampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });
        
        this.recreateShaderTextures();
        this.UIRenderer.init();
    }

    async setupPostProcessingShaders(){

        this.postprocess_vertex_module = this.device.createShaderModule({ 
            code: await fetch('game_engine/shaders/postprocess_vertex.wgsl').then(response => response.text())
        });

        const box_blur_module = this.device.createShaderModule({ code: await fetch('game_engine/shaders/box_blur.wgsl').then(response => response.text())});

        this.box_blur =  await this.device.createRenderPipelineAsync({
            vertex: {
                module: this.postprocess_vertex_module,
                entryPoint: 'vertex_main',
            },
            fragment: {
                module: box_blur_module,
                entryPoint: 'fragment_main',
                targets: [{ format : this.format }],
            },
            layout: 'auto',
        });

        const just_output_module = this.device.createShaderModule({ code: await fetch('game_engine/shaders/just_output.wgsl').then(response => response.text())});

        this.just_output =  await this.device.createRenderPipelineAsync({
            vertex: {
                module: this.postprocess_vertex_module,
                entryPoint: 'vertex_main',
            },
            fragment: {
                module: just_output_module,
                entryPoint: 'fragment_main',
                targets: [{ format : this.format }],
            },
            layout: 'auto',
        });

        const negative_module = this.device.createShaderModule({ code: await fetch('game_engine/shaders/negative.wgsl').then(response => response.text())});

        this.negative =  await this.device.createRenderPipelineAsync({
            vertex: {
                module: this.postprocess_vertex_module,
                entryPoint: 'vertex_main',
            },
            fragment: {
                module: negative_module,
                entryPoint: 'fragment_main',
                targets: [{ format : this.format }],
            },
            layout: 'auto',
        });

        const greyscale_module = this.device.createShaderModule({ code: await fetch('game_engine/shaders/greyscale.wgsl').then(response => response.text())});

        this.greyscale = await this.device.createRenderPipelineAsync({
            vertex: {
                module: this.postprocess_vertex_module,
                entryPoint: 'vertex_main',
            },
            fragment: {
                module: greyscale_module,
                entryPoint: 'fragment_main',
                targets: [{ format : this.format }],
            },
            layout: 'auto',
        });

        const downsample_module = this.device.createShaderModule({ code: await fetch('game_engine/shaders/downsample.wgsl').then(response => response.text())});

        this.downsample = await this.device.createRenderPipelineAsync({
            vertex: {
                module: this.postprocess_vertex_module,
                entryPoint: 'vertex_main',
            },
            fragment: {
                module: downsample_module,
                entryPoint: 'fragment_main',
                targets: [{ format : this.format }],
            },
            layout: 'auto',
        });

    }


    prepareNode(node) {
        if (this.gpuObjects.has(node)) {
            return this.gpuObjects.get(node);
        }

        const modelUniformBuffer = this.device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const modelBindGroup = this.device.createBindGroup({
            layout: this.modelBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: modelUniformBuffer } },
            ],
        });

        const gpuObjects = { modelUniformBuffer, modelBindGroup };
        this.gpuObjects.set(node, gpuObjects);
        return gpuObjects;
    }

    prepareCamera(camera) {
        if (this.gpuObjects.has(camera)) {
            return this.gpuObjects.get(camera);
        }

        const cameraUniformBuffer = this.device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const cameraBindGroup = this.device.createBindGroup({
            layout: this.cameraBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: cameraUniformBuffer } }
            ],
        });

        const gpuObjects = { cameraUniformBuffer, cameraBindGroup };
        this.gpuObjects.set(camera, gpuObjects);
        return gpuObjects;
    }

    prepareTexture(texture) {
        if (this.gpuObjects.has(texture)) {
            return this.gpuObjects.get(texture);
        }

        const { gpuTexture } = this.prepareImage(texture.image, texture.isSRGB);
        const { gpuSampler } = this.prepareSampler(texture.sampler);

        const gpuObjects = { gpuTexture, gpuSampler };
        this.gpuObjects.set(texture, gpuObjects);
        return gpuObjects;
    }

    prepareMaterial(material) {
        if (this.gpuObjects.has(material)) {
            return this.gpuObjects.get(material);
        }

        const baseTexture = this.prepareTexture(material.baseTexture);

        const materialUniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const materialBindGroup = this.device.createBindGroup({
            layout: this.materialBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: materialUniformBuffer } },
                { binding: 1, resource: baseTexture.gpuTexture.createView() },
                { binding: 2, resource: baseTexture.gpuSampler },
            ],
        });

        const gpuObjects = { materialUniformBuffer, materialBindGroup };
        this.gpuObjects.set(material, gpuObjects);
        return gpuObjects;
    }

    prepareLight(light) {
        if (this.gpuObjects.has(light)) {
            return this.gpuObjects.get(light);
        }

        const lightUniformBuffer = this.device.createBuffer({
            size: 144,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const lightDepthTexture = this.device.createTexture({
            format: 'depth24plus',
            size: light.resolution,
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        });

        const lightDepthSampler = this.device.createSampler({
            minFilter: 'linear',
            magFilter: 'linear',
            compare: 'less',
        });

        const lightBindGroup = this.device.createBindGroup({
            layout: this.lightBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: lightUniformBuffer } },
                { binding: 1, resource: lightDepthTexture.createView() },
                { binding: 2, resource: lightDepthSampler },
            ],
        });

        const gpuObjects = {
            lightUniformBuffer,
            lightBindGroup,
            lightDepthTexture,
            lightDepthSampler,
        };
        this.gpuObjects.set(light, gpuObjects);
        return gpuObjects;
    }

    recreateShaderTextures() {
        this.depthTexture?.destroy();
        this.depthTexture = this.device.createTexture({
            format: 'depth24plus',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.interTexture1?.destroy();
        this.interTexture1 = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE | GPUTextureUsage.SAMPLED,
            label: 'interTexture1',
            format: this.format
        });

        this.interTexture2?.destroy();
        this.interTexture2 = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT | 
                GPUTextureUsage.STORAGE | 
                GPUTextureUsage.SAMPLED,
            label: 'interTexture2',
            format: this.format
        });

        this.cur_texture_buffer = this.interTexture1;
        this.next_texture_buffer = this.interTexture2;
    }

    renderPostProcessingEffect(effect_frag_pipeline, tex_sampler, readFromTexture, writeToTexture){
        const encoder = this.device.createCommandEncoder();

        const postProcessView = readFromTexture.createView();
        const returnView = writeToTexture.createView();

        const postProcessBindGroup = this.device.createBindGroup({
            layout: effect_frag_pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: postProcessView },
                { binding: 1, resource: tex_sampler },
            ],
        });

        const postProcessingPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: returnView,
                    clearValue: [0, 0, 0, 1],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });
        postProcessingPass.setPipeline(effect_frag_pipeline);
        postProcessingPass.setBindGroup(0, postProcessBindGroup);
        postProcessingPass.draw(6);
        postProcessingPass.end();

        this.device.queue.submit([encoder.finish()]);

        this.switch_texture_buffers();
    }

    renderShadows(scene) {
        const lights = scene.filter(node => node.getComponentOfType(Light));
        for (const light of lights) {
            const lightComponent = light.getComponentOfType(Light);
            const { lightDepthTexture } = this.prepareLight(lightComponent);

            const encoder = this.device.createCommandEncoder();
            this.renderPass = encoder.beginRenderPass({
                colorAttachments: [],
                depthStencilAttachment: {
                    view: lightDepthTexture.createView(),
                    depthClearValue: 1,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store',
                },
            });
            this.renderPass.setPipeline(this.shadowPipeline);

            const cameraComponent = light.getComponentOfType(Camera);
            const viewMatrix = getGlobalViewMatrix(light);
            const projectionMatrix = getProjectionMatrix(light);
            const lightPosition = mat4.getTranslation(vec3.create(), getGlobalModelMatrix(light));
            const { cameraUniformBuffer, cameraBindGroup } = this.prepareCamera(cameraComponent);
            this.device.queue.writeBuffer(cameraUniformBuffer, 0, viewMatrix);
            this.device.queue.writeBuffer(cameraUniformBuffer, 64, projectionMatrix);
            this.renderPass.setBindGroup(0, cameraBindGroup);

            this.renderNode(scene);

            this.renderPass.end();
            this.device.queue.submit([encoder.finish()]);
        }
    }

    renderColor(scene, camera, save_texture) {
        const encoder = this.device.createCommandEncoder();
        this.renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: save_texture.createView(),
                    clearValue: [1, 1, 1, 1],
                    loadOp: 'clear',
                    storeOp: 'store',
                }
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'discard',
            },
        });
        this.renderPass.setPipeline(this.pipeline);

        const cameraComponent = camera.getComponentOfType(Camera);
        const viewMatrix = getGlobalViewMatrix(camera);
        const projectionMatrix = getProjectionMatrix(camera);
        const cameraPosition = mat4.getTranslation(vec3.create(), getGlobalModelMatrix(camera));
        const { cameraUniformBuffer, cameraBindGroup } = this.prepareCamera(cameraComponent);
        this.device.queue.writeBuffer(cameraUniformBuffer, 0, viewMatrix);
        this.device.queue.writeBuffer(cameraUniformBuffer, 64, projectionMatrix);
        this.renderPass.setBindGroup(0, cameraBindGroup);

        const light = scene.find(node => node.getComponentOfType(Light));
        const lightComponent = light.getComponentOfType(Light);
        const lightViewMatrix = getGlobalViewMatrix(light);
        const lightProjectionMatrix = getProjectionMatrix(light);
        const lightPosition = mat4.getTranslation(vec3.create(), getGlobalModelMatrix(light));
        const { lightUniformBuffer, lightBindGroup } = this.prepareLight(lightComponent);
        this.device.queue.writeBuffer(lightUniformBuffer, 0, lightViewMatrix);
        this.device.queue.writeBuffer(lightUniformBuffer, 64, lightProjectionMatrix);
        this.device.queue.writeBuffer(lightUniformBuffer, 128, lightPosition);
        this.renderPass.setBindGroup(3, lightBindGroup);

        this.renderNode(scene);
        this.renderPass.end();

        this.device.queue.submit([encoder.finish()]);
    }

    
    renderNode(node, modelMatrix = mat4.create()) {
        const localMatrix = getLocalModelMatrix(node);
        modelMatrix = mat4.multiply(mat4.create(), modelMatrix, localMatrix);
        const normalMatrix = mat4.normalFromMat4(mat4.create(), modelMatrix);

        const { modelUniformBuffer, modelBindGroup } = this.prepareNode(node);
        this.device.queue.writeBuffer(modelUniformBuffer, 0, modelMatrix);
        this.device.queue.writeBuffer(modelUniformBuffer, 64, normalMatrix);
        this.renderPass.setBindGroup(1, modelBindGroup);

        for (const model of getModels(node)) {
            this.renderModel(model);
        }

        for (const child of node.children) {
            this.renderNode(child, modelMatrix);
        }
    }

    renderModel(model) {
        for (const primitive of model.primitives) {
            this.renderPrimitive(primitive);
        }
    }

    renderPrimitive(primitive) {
        const { materialUniformBuffer, materialBindGroup } = this.prepareMaterial(primitive.material);
        this.device.queue.writeBuffer(materialUniformBuffer, 0, new Float32Array([
            ...primitive.material.baseFactor,
        ]));
        this.renderPass.setBindGroup(2, materialBindGroup);

        const { vertexBuffer, indexBuffer } = this.prepareMesh(primitive.mesh, vertexBufferLayout);
        this.renderPass.setVertexBuffer(0, vertexBuffer);
        this.renderPass.setIndexBuffer(indexBuffer, 'uint32');

        this.renderPass.drawIndexed(primitive.mesh.indices.length);
    }

}
