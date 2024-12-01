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
import { Physics } from './Physics.js';


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
        displaying_progress = false,
        wave_progress = 0.0,
        wave_enemy_count = 10,

        camera = undefined,
        player = undefined,
        light = undefined,


    } = {}) {
        this.loader = new GameLoader(world_path, asset_folder, this);
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
        this.UI_data = {
            progress_bar_pos_x : 0.5, //in UV space, in the middle
            progress_bar_pos_y: 0.04, //in UV space
            weapon_ui_pos_x : 0.03,
            weapon_ui_pos_y : 0.7,
            weapon_ui_variation: 1
        }

        //game loop
        this.wave_progress = wave_progress;                 //% of wave defeated [0-1]
        this.displaying_progress = displaying_progress;     //bool if you want the UI to draw progress bar
        this.next_wave_enemy_count = wave_enemy_count;      //count of how many to spawn during entire wave
        this.cur_wave_enemy_count = 0;                      //count of how many enemies have been spawned so far
        this.cur_enemy_killed = 0;                          //count of how many enemies have been killed

        this.game_state_enum = {
            WAVE_RESET: 0,
            IDLE : 1,
            WAVE_BEGINNING : 2,
            WAVE_IN_PROGRESS : 3,
            WAVE_END : 4,
        };

    }

    update(t, dt){
        this.game_time = t; 

        switch (this.state){
            case this.game_state_enum.WAVE_RESET:
                this.create_instance(GameInstance_tool.type_enum.CRATE, [0,0], 40, 0);
                this.state = this.game_state_enum.IDLE;
                break;
            case this.game_state_enum.IDLE:
                break;
            case this.game_state_enum.WAVE_BEGINNING:
                //setting up data for wave
                this.displaying_progress = true;
                this.wave_progress = 0.0;
                this.next_wave_enemy_count = 3;

                //start next wave
                this.state = this.game_state_enum.WAVE_IN_PROGRESS;
                break;
            case this.game_state_enum.WAVE_IN_PROGRESS:

                this.spawn_enemies();
                if (this.cur_enemy_killed == this.next_wave_enemy_count){
                    this.state = this.game_state_enum.WAVE_END;
                }
                break;
            case this.game_state_enum.WAVE_END:
                this.displaying_progress = false;
                this.wave_progress = 0.0;
                this.cur_enemy_killed = 0;
                this.cur_wave_enemy_count = 0;
                this.next_wave_enemy_count = 3; // spawn logic - TODO
                this.state = this.game_state_enum.WAVE_RESET;
                break;
            default:
                console.log("game stateless error");
        }

        this.physics.update(t, dt);
        this.update_scene(t, dt);
    }

    spawn_enemies(){
        //main enemy spawning logic - TODO
        if (this.cur_wave_enemy_count < this.next_wave_enemy_count){
            this.spawn_enemy(GameInstance_tool.type_enum.ENEMY_STANDARD, 0, 10, 0);
            this.spawn_enemy(GameInstance_tool.type_enum.ENEMY_TANK, 10, 20, 0);
            this.spawn_enemy(GameInstance_tool.type_enum.ENEMY_FAST, 0, 30, 0);
            this.cur_wave_enemy_count += 3;
        }
        
        
    }

    enemy_death_event(id, type){
        this.cur_enemy_killed += 1;
        this.wave_progress = (this.cur_enemy_killed / this.next_wave_enemy_count);
    }

    crate_break_event(){
        this.state = this.game_state_enum.WAVE_BEGINNING;
    }

    update_scene(t, dt){
        this.instances.forEach(instance => {
            if (instance == undefined){
                return;
            }
            instance.update(t, dt);
        });
        this.loader.update(t, dt);
    }

    async load(){
        this.physics = new Physics(this);
        await this.loader.initialize();
        this.instances = this.loader.get_instance_list(this);
        this.instance_count = this.instances.length;
        this.next_id = this.instance_count;

        await this.loadPlayer();
        
        
    }

    async spawn_enemy(enemy_type, x, y, dir){
        return await this.create_instance(enemy_type, [x,y], 0, dir);
    }


    async loadPlayer(){
        this.player = await this.create_instance(GameInstance_tool.type_enum.PLAYER, [3,3], -0.1, 0);
        this.loader.loadController(this);

        this.player.weapon = await this.create_instance(GameInstance_tool.type_enum.HARPOON_EMPTY, [0,0], 1, 0)
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