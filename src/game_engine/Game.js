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
import { GameInstance_type, GameInstance, GameInstance_tool } from './GameInstance.js';
import { TopDownController } from './TopDownController.js';


export class Game {
    constructor( {
        world_path = 'src/assets/development_tmp/bregar_dev_tmp/world/test_world.gltf',
        asset_folder = 'assets',
        instance_count = 0,
        next_id = 0,
        state = 0,
        game_time = 0,
        output_framerate = false,
        fps_timer_ms = 150,
        last_frame_t = 0,
        displaying_progress = true,
        wave_progress = 0.7,
        
        camera = undefined,
        player = undefined,
        light = undefined,

    } = {}) {
        this.loader = new GameLoader(world_path, asset_folder);
        this.instances = [];
        this.instance_count = instance_count;
        this.state = state;
        this.next_id = next_id;
        this.game_time = game_time;
        
        this.fps_timer_ms = fps_timer_ms
        this.next_timer_trigger_time = fps_timer_ms;
        this.last_frame_t = 0;
        
        //coding
        this.player = player;
        this.camera = camera;
        this.light = light;
        this.output_framerate = output_framerate


        //game loop
        this.wave_progress = wave_progress;
        this.displaying_progress = displaying_progress;

    }

    update(t, dt){
        this.game_time = t;
        this.instances.forEach(instance => {
            if (instance == undefined){
                return;
            }
            instance.update(t, dt);
        });

        this.loader.update(t, dt);

        //this.wave_progress += 0.001;
        if (this.wave_progress >= 1){
            this.wave_progress = 0;
        }
    }

    async load(){
        await this.loader.initialize();
        this.instances = this.loader.get_instance_list(this);

        await this.loadPlayer();
        
        this.instance_count = this.instances.length;
    }

    async loadPlayer(){
        this.player = await this.create_instance(GameInstance_tool.type_enum.PLAYER, [0,0], 0.8, 0, {
            is_dynamic: true,
            is_rigid: true,
            velocity_2d: [0, 0],
            max_speed: 10,
            can_bypass_max_speed: false,
            acceleration_2d: [0, 0],
            acceleration: 5,
            friction: 0.999,
        });
        this.loader.loadController(this);
    }

    async create_instance(type, position_2d, elevation, rotation, properties){
        const inst = await this.loader.create_instance(this, type, position_2d, elevation, rotation, properties);
        this.instances.push(inst);
        this.instance_count++;
        this.next_id++;
        return inst;
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
        if (this.output_framerate == true && this.game_time*1000 > this.next_timer_trigger_time){
            const dt = this.game_time - this.last_frame_t;
            console.clear();
            console.log((dt*1000).toFixed(2)+" ms ("+(1000 / (dt*1000)).toFixed(2)+" fps)");
            this.next_timer_trigger_time = this.game_time * 1000 + this.fps_timer_ms;
        }
        this.loader.renderer.render(this.loader.render_scene, this.camera, this);
        this.last_frame_t = this.game_time;
    }
    resize(width, height){
        this.camera.getComponentOfType(Camera).aspect = width / height;
    }
}