import {
    Accessor,
    Camera,
    Material,
    Mesh,
    Model,
    Node,
    Primitive,
    Sampler,
    Texture,
    Transform,
    Vertex,
} from 'engine/core.js';

import { GameInstance_type, GameInstance, GameInstance_tool, StandardEnemy, TankEnemy, WaveCrate, Player, HarpoonGunWeapon } from './GameInstance.js';
import { loadResources } from 'engine/loaders/resources.js';
import { quat, vec3, mat4, vec2 } from 'glm';
import { GameRenderer } from './GameRenderer.js';
import { FirstPersonController } from 'engine/controllers/FirstPersonController.js';
import { Light } from './Light.js';
import { TopDownController } from './TopDownController.js';


export class GameLoader {


    constructor(gltf_path, asset_map_path, game_ref,{

    } = {}) {
        this.gltf_path = '../'+gltf_path;
        this.instance_asset_map_path = asset_map_path;
        this.instance_init_lookup = undefined;
        this.render_scene = undefined;
        this.canvas = undefined;
        this.renderer = undefined;
        this.game_ref = game_ref;
    }

    async initialize(){
        //init graphics setup
        this.canvas = document.querySelector('canvas');

        this.renderer = new GameRenderer(this.canvas, this.game_ref);
        await this.renderer.initialize();

        //init loader
        this.gltfUrl = new URL(this.gltf_path, window.location);
        this.gltf = await this.fetchJson(this.gltfUrl);
        this.defaultScene = this.gltf.scene ?? 0;
        this.cache = new Map();

        await Promise.all(this.gltf.buffers?.map(buffer => this.preloadBuffer(buffer)) ?? []);
        await Promise.all(this.gltf.images?.map(image => this.preloadImage(image)) ?? []);

        this.instance_init_lookup = await this.fetchJson(this.instance_asset_map_path + "/instance_lookup.json");

        return this;
    }
    
    get_instance_list(game_ref) {
        this.render_scene = this.loadScene(this.defaultScene);

        const game_instances = []
        var id = 0;


        this.render_scene.traverse(node => {
            const type = node.getComponentOfType(GameInstance_type);
            if (type.type_id <= GameInstance_tool.type_enum.SCENE){
                return;
            }

            //const transform = node.getComponentOfType(Transform);
            //console.log(transform);

            const instance = this.init_instance(game_ref, id, type.type_id);
            instance.render_node = node
            instance.update_2d_position();
            game_instances.push(instance);

            id++;
        });

        const global_light = this.load_global_light(512*8, Math.PI - 0.4);

        this.render_scene.addChild(global_light);
        //game_ref.player = GameInstance_tool.init_instance(game_ref, id++, GameInstance_tool.type_enum.PLAYER);
        game_ref.light = global_light;
        return game_instances;
    }

    load_global_light(resolution, fov){
        const global_light = this.loadNode('Global_light');

        const light_transform = global_light.getComponentOfType(Transform);
        const down_rotation = quat.create();
        quat.rotateX(down_rotation, down_rotation, -1.57);
        light_transform.rotation = down_rotation


        global_light.addComponent(new Light({resolution : [resolution, resolution]}));
        global_light.addComponent(new Camera({
            near: 2,
            far: light_transform.translation[1],
            fovy: fov,
        }));

        return global_light;
    }


    loadController(game_ref){
        const camera = this.loadNode('Camera');
        camera.addComponent(new TopDownController(game_ref.player, camera, this.canvas));
        game_ref.camera = camera;
        this.render_scene.addChild(camera);
    }

    async create_instance(game_ref, type, position_2d, elevation, rotation, properties){
        const mats = this.instance_init_lookup[type - 1].materials;
        const res = await loadResources({
            'mesh': new URL(mats.mesh, import.meta.url),
            'image': new URL(mats.image, import.meta.url),
        });
        //construct into node
        const node = new Node();
        node.addComponent(new Transform());
        node.addComponent(new GameInstance_type(type));
        
        const instance = this.init_instance(game_ref, game_ref.next_id, type);

        const model_array = [];
        const multi_model = instance.properties.is_multi_model;
        if (multi_model != undefined){
            const model_count = instance.properties.model_count;
            const mat_array = []
            
            Object.keys(mats).forEach(function(key,index) {
                mat_array.push(key);
            });

            for (let i = 0; i < model_count * 2; i+=2){
                const res = await loadResources({
                    'mesh': new URL(mats[mat_array[i]], import.meta.url),
                    'image': new URL(mats[mat_array[i+1]], import.meta.url),
                });
                const model = new Model({
                    primitives: [
                        new Primitive({
                            mesh: res.mesh,
                            material: new Material({
                                baseTexture: new Texture({
                                    image: res.image,
                                    sampler: new Sampler(),
                                }),
                            }),
                        }),
                    ],
                });
                model_array.push(model);
            }
            node.addComponent(model_array[0]);
        } else {
            const model = new Model({
                primitives: [
                    new Primitive({
                        mesh: res.mesh,
                        material: new Material({
                            baseTexture: new Texture({
                                image: res.image,
                                sampler: new Sampler(),
                            }),
                        }),
                    }),
                ],
            });
            node.addComponent(model);
        }


        const model_scale = instance.properties.model_scale;
        if (model_scale != undefined){
            const transform = node.getComponentOfType(Transform);
            transform.scale = [model_scale, model_scale, model_scale];
        }
        const model_elevation = instance.properties.model_elevation;
        if (model_elevation != undefined){
            instance.elevation = model_elevation;
        } else {
            instance.elevation = elevation;
        }
        
        instance.render_node = node;
        instance.world_position = position_2d;
        
        vec2.rotate(instance.facing_direction, instance.facing_direction, [0,0], rotation);
        instance.properties = properties == undefined ? instance.properties : properties;
        instance.model_buffer = model_array;

        this.render_scene.addChild(node);   
        instance.update_3d_position();
        return instance;
    }

    init_instance(game_ref, id, type){
        var instance;
        if (type == GameInstance_tool.type_enum.ENEMY_STANDARD){
            instance = new StandardEnemy(game_ref, id, type);
        } else if (type == GameInstance_tool.type_enum.ENEMY_TANK){
            instance = new TankEnemy(game_ref, id, type);
        } else if (type == GameInstance_tool.type_enum.CRATE){
            instance = new WaveCrate(game_ref, id, type);
        } else if (type == GameInstance_tool.type_enum.PLAYER){
            instance = new Player(game_ref, id, type);
        } else if (type == GameInstance_tool.type_enum.HARPOON_EMPTY){
            instance = new HarpoonGunWeapon(game_ref, id, type);
        } else {
            instance = new GameInstance(game_ref, id, type);
        }
        if (type > 0){
            instance.properties = this.instance_init_lookup[type - 1].properties;
        }
        return instance;
    }   

    update(t, dt){
        this.render_scene.traverse(node => {
            for (const component of node.components) {
                component.update?.(t, dt);
            }
        });
    }

    findByNameOrIndex(list, nameOrIndex) {
        if (typeof nameOrIndex === 'number') {
            return list[nameOrIndex];
        } else {
            return list.find(element => element.name === nameOrIndex);
        }
    }

    async fetchJson(url) {
        return fetch(url)
            .then(response => response.json());
    }

    fetchBuffer(url) {
        return fetch(url)
            .then(response => response.arrayBuffer());
    }

    fetchImage(url) {
        return fetch(url)
            .then(response => response.blob())
            .then(blob => createImageBitmap(blob));
    }

    async preloadImage(gltfSpec) {
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        if (gltfSpec.uri) {
            const url = new URL(gltfSpec.uri, this.gltfUrl);
            const image = await this.fetchImage(url);
            this.cache.set(gltfSpec, image);
            return image;
        } else {
            const bufferView = this.gltf.bufferViews[gltfSpec.bufferView];
            const buffer = this.loadBuffer(bufferView.buffer);
            const dataView = new DataView(buffer, bufferView.byteOffset ?? 0, bufferView.byteLength);
            const blob = new Blob([dataView], { type: gltfSpec.mimeType });
            const url = URL.createObjectURL(blob);
            const image = await this.fetchImage(url);
            URL.revokeObjectURL(url);
            this.cache.set(gltfSpec, image);
            return image;
        }
    }

    async preloadBuffer(gltfSpec) {
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const url = new URL(gltfSpec.uri, this.gltfUrl);
        const buffer = await this.fetchBuffer(url);
        this.cache.set(gltfSpec, buffer);
        return buffer;
    }

    loadImage(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.images, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }

        return this.cache.get(gltfSpec);
    }

    loadBuffer(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.buffers, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }

        return this.cache.get(gltfSpec);
    }

    loadSampler(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.samplers, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const minFilter = {
            9728: 'nearest',
            9729: 'linear',
            9984: 'nearest',
            9985: 'linear',
            9986: 'nearest',
            9987: 'linear',
        };

        const magFilter = {
            9728: 'nearest',
            9729: 'linear',
        };

        const mipmapFilter = {
            9728: 'nearest',
            9729: 'linear',
            9984: 'nearest',
            9985: 'nearest',
            9986: 'linear',
            9987: 'linear',
        };

        const addressMode = {
            33071: 'clamp-to-edge',
            33648: 'mirror-repeat',
            10497: 'repeat',
        };

        const sampler = new Sampler({
            minFilter: minFilter[gltfSpec.minFilter ?? 9729],
            magFilter: magFilter[gltfSpec.magFilter ?? 9729],
            mipmapFilter: mipmapFilter[gltfSpec.minFilter ?? 9729],
            addressModeU: addressMode[gltfSpec.wrapS ?? 10497],
            addressModeV: addressMode[gltfSpec.wrapT ?? 10497],
        });

        this.cache.set(gltfSpec, sampler);
        return sampler;
    }

    loadTexture(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.textures, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const options = {};
        if (gltfSpec.source !== undefined) {
            options.image = this.loadImage(gltfSpec.source);
        }
        if (gltfSpec.sampler !== undefined) {
            options.sampler = this.loadSampler(gltfSpec.sampler);
        } else {
            options.sampler = new Sampler();
        }

        const texture = new Texture(options);

        this.cache.set(gltfSpec, texture);
        return texture;
    }

    loadMaterial(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.materials, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const options = {};
        const pbr = gltfSpec.pbrMetallicRoughness;
        if (pbr) {
            if (pbr.baseColorTexture) {
                options.baseTexture = this.loadTexture(pbr.baseColorTexture.index);
                options.baseTexture.isSRGB = true;
            }
            if (pbr.metallicRoughnessTexture) {
                options.metalnessTexture = this.loadTexture(pbr.metallicRoughnessTexture.index);
                options.roughnessTexture = this.loadTexture(pbr.metallicRoughnessTexture.index);
            }
            options.baseFactor = pbr.baseColorFactor;
            options.metalnessFactor = pbr.metallicFactor;
            options.roughnessFactor = pbr.roughnessFactor;
        }

        if (gltfSpec.normalTexture) {
            options.normalTexture = this.loadTexture(gltfSpec.normalTexture.index);
            options.normalFactor = gltfSpec.normalTexture.scale;
        }

        if (gltfSpec.emissiveTexture) {
            options.emissionTexture = this.loadTexture(gltfSpec.emissiveTexture.index);
            options.emissionTexture.isSRGB = true;
            options.emissionFactor = gltfSpec.emissiveFactor;
        }

        if (gltfSpec.occlusionTexture) {
            options.occlusionTexture = this.loadTexture(gltfSpec.occlusionTexture.index);
            options.occlusionFactor = gltfSpec.occlusionTexture.strength;
        }

        const material = new Material(options);

        this.cache.set(gltfSpec, material);
        return material;
    }

    loadAccessor(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.accessors, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        if (gltfSpec.bufferView === undefined) {
            console.warn('Accessor does not reference a buffer view');
            return null;
        }

        const bufferView = this.gltf.bufferViews[gltfSpec.bufferView];
        const buffer = this.loadBuffer(bufferView.buffer);

        const componentType = {
            5120: 'int',
            5121: 'int',
            5122: 'int',
            5123: 'int',
            5124: 'int',
            5125: 'int',
            5126: 'float',
        }[gltfSpec.componentType];

        const componentSize = {
            5120: 1,
            5121: 1,
            5122: 2,
            5123: 2,
            5124: 4,
            5125: 4,
            5126: 4,
        }[gltfSpec.componentType];

        const componentSigned = {
            5120: true,
            5121: false,
            5122: true,
            5123: false,
            5124: true,
            5125: false,
            5126: false,
        }[gltfSpec.componentType];

        const componentCount = {
            SCALAR: 1,
            VEC2: 2,
            VEC3: 3,
            VEC4: 4,
            MAT2: 4,
            MAT3: 9,
            MAT4: 16,
        }[gltfSpec.type];

        const componentNormalized = gltfSpec.normalized ?? false;

        const stride = bufferView.byteStride ?? (componentSize * componentCount);
        const offset = gltfSpec.byteOffset ?? 0;
        const viewOffset = bufferView.byteOffset ?? 0;
        const viewLength = bufferView.byteLength;

        const accessor = new Accessor({
            buffer,
            viewLength,
            viewOffset,
            offset,
            stride,

            componentType,
            componentCount,
            componentSize,
            componentSigned,
            componentNormalized,
        });

        this.cache.set(gltfSpec, accessor);
        return accessor;
    }

    createMeshFromPrimitive(spec) {
        if (spec.attributes.POSITION === undefined) {
            console.warn('No position in mesh');
            return new Mesh();
        }

        if (spec.indices === undefined) {
            console.warn('No indices in mesh');
            return new Mesh();
        }

        const accessors = {};
        for (const attribute in spec.attributes) {
            accessors[attribute] = this.loadAccessor(spec.attributes[attribute]);
        }

        const position = accessors.POSITION;
        const texcoords = accessors.TEXCOORD_0;
        const normal = accessors.NORMAL;
        const tangent = accessors.TANGENT;

        const vertexCount = position.count;
        const vertices = [];

        for (let i = 0; i < vertexCount; i++) {
            const options = {};

            if (position) { options.position = position.get(i); }
            if (texcoords) { options.texcoords = texcoords.get(i); }
            if (normal) { options.normal = normal.get(i); }
            if (tangent) { options.tangent = tangent.get(i); }

            vertices.push(new Vertex(options));
        }

        const indices = [];
        const indicesAccessor = this.loadAccessor(spec.indices);
        const indexCount = indicesAccessor.count;

        for (let i = 0; i < indexCount; i++) {
            indices.push(indicesAccessor.get(i));
        }

        return new Mesh({ vertices, indices });
    }

    loadMesh(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.meshes, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const primitives = [];
        for (const primitiveSpec of gltfSpec.primitives) {
            if (primitiveSpec.mode !== 4 && primitiveSpec.mode !== undefined) {
                console.warn(`GLTFLoader: skipping primitive with mode ${primitiveSpec.mode}`);
                continue;
            }

            const options = {};
            options.mesh = this.createMeshFromPrimitive(primitiveSpec);

            if (primitiveSpec.material !== undefined) {
                options.material = this.loadMaterial(primitiveSpec.material);
            }

            primitives.push(new Primitive(options));
        }

        const model = new Model({ primitives });

        this.cache.set(gltfSpec, model);
        return model;
    }

    loadCamera(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.cameras, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const options = {};
        if (gltfSpec.type === 'perspective') {
            const { aspectRatio, yfov, znear, zfar } = gltfSpec.perspective;
            Object.assign(options, {
                orthographic: 0,
                aspect: aspectRatio,
                fovy: yfov,
                near: znear,
                far: zfar,
            });
        } else if (gltfSpec.type === 'orthographic') {
            const { xmag, ymag, znear, zfar } = gltfSpec.orthographic;
            Object.assign(options, {
                orthographic: 1,
                aspect: xmag / ymag,
                halfy: ymag,
                near: znear,
                far: zfar,
            });
        }

        const camera = new Camera(options);

        this.cache.set(gltfSpec, camera);
        return camera;
    }

    loadNode(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.nodes, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const node = new Node();

        node.addComponent(new Transform(gltfSpec));

        if (gltfSpec.children) {
            for (const childIndex of gltfSpec.children) {
                node.addChild(this.loadNode(childIndex));
            }
        }

        if (gltfSpec.camera !== undefined) {
            node.addComponent(this.loadCamera(gltfSpec.camera));
        }

        if (gltfSpec.mesh !== undefined) {
            node.addComponent(this.loadMesh(gltfSpec.mesh));
        }

        if (gltfSpec.extras !== undefined && gltfSpec.extras.type_id !== undefined) {
            node.addComponent(new GameInstance_type(gltfSpec.extras.type_id));
        } else {
            node.addComponent(new GameInstance_type(GameInstance_tool.type_enum.UNDEFINED));
        }

        this.cache.set(gltfSpec, node);
        return node;
    }

    loadScene(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.scenes, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const scene = new Node();
        if (gltfSpec.nodes) {
            for (const nodeIndex of gltfSpec.nodes) {
                scene.addChild(this.loadNode(nodeIndex));
            }
        }
        scene.addComponent(new GameInstance_type(GameInstance_tool.type_enum.SCENE))

        this.cache.set(gltfSpec, scene);
        return scene;
    }

}
