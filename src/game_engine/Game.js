import {
    Node,
    Camera,
    Transform,
    Model,
    Texture,
    Sampler,
    Primitive,
    Material
} from 'engine/core.js';
import { GameLoader } from './GameLoader.js';
import { GameInstance_type, GameInstance } from './GameInstance.js';

export class Game {

    constructor( {

        world_path = 'src/assets/development_tmp/bregar_dev_tmp/world/test_world.gltf',
        asset_folder = 'assets',
        instance_count = 0,
        next_id = 0,
        state = 0,

        camera = undefined,
        player = undefined,
        light = undefined,

    } = {}) {
        this.loader = new GameLoader(world_path, asset_folder);
        this.instances = [];
        this.instance_count = instance_count;
        this.state = state;
        this.next_id = next_id;

        this.player = player;
        this.camera = camera;
        this.light = light;
    }

    update(t, dt){
        //controller update
        //physics update
        this.instances.forEach(instance => {
            if (instance == undefined){
                return;
            }
            instance.update(t, dt);
        });

        this.loader.update(t, dt);
    }

    async load(){
        await this.loader.initialize();
        this.instances = this.loader.get_instance_list(this);
        this.instance_count = this.instances.length;

    }

    async create_instance(type, position_2d, elevation, rotation, properties){
        const inst = await this.loader.create_instance(this, type, position_2d, elevation, rotation, properties);
        this.instances.push(inst);
        this.instance_count++;
        this.next_id++;
    }

    remove_instance(id){
        const inst = this.instances[id];
        this.loader.render_scene.removeChild(inst.render_node);
        this.instances[id] = undefined;
        this.instance_count--;
    }


    get_canvas(){
        return this.loader.canvas;
    }
    render(){
        this.loader.renderer.render(this.loader.render_scene, this.camera);
    }
    resize(width, height){
        this.camera.getComponentOfType(Camera).aspect = width / height;
    }
}