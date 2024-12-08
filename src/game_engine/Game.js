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
import { GameInstance_type, GameInstance, GameInstance_tool, Enemy, Player, HarpoonGunWeapon, BoltPickup } from './GameInstance.js';
import { TopDownController } from './TopDownController.js';
import { Physics } from './Physics.js';
import { wave_settings, camera_settings } from './config.js'
import { quat, vec3, mat4, vec2 } from 'glm';


export class Game {
    constructor( {
        world_path = 'src/assets/world/world_mid.gltf',
        asset_folder = 'assets',
        instance_count = 0,
        next_id = 0,
        state = 0,
        game_time = 0,
        output_framerate = false,
        fps_timer_ms = 150,
        displaying_progress = false,
        wave_progress = 0.0,

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
        this.camera_settings = camera_settings;
        
        this.player = player;
        this.camera = camera;
        this.light = light;
        this.output_framerate = output_framerate
        this.UI_data = {
            progress_bar_pos_x : 0.5, //in UV space, in the middle
            progress_bar_pos_y: 0.04, //in UV space
            weapon_ui_pos_x : 0.03,
            weapon_ui_pos_y : 0.7,
            weapon_ui_variation: 0
        }
        this.game_tip_animation_duration = 1;
        this.game_tip_enabled = true;
        this.bolt_tip_enabled = false;
        this.bolt_tip_animation_duration = 0;

        //game loop
        this.game_reset_flag = false;
        this.reload_player = false;
        this.game_reset_length = 2;
        this.game_reset_timer = 0;

        this.wave_progress = wave_progress;                 //% of wave defeated [0-1]
        this.displaying_progress = displaying_progress;     //bool if you want the UI to draw progress bar
        this.cur_enemy_count = 0;                           //count of how many enemies have been spawned so far
        this.cur_enemy_counts = [0, 0, 0];                  //count how many of each enemy has been spawned so far
        this.cur_enemy_killed = 0;                          //count of how many enemies have been killed
        this.wave_count = 0;                                //current wave count, increments every time the box is destroyed
        this.amount_of_enemies_to_spawn = 1.0;              //internal counter for when to spawn enemies
        this.tank_spawn_angles = [];

        this.playable_area = {
            min: [-100, -1, -90],
            max: [100, 10, 106]
        }

        this.total_enemy_counts_per_wave = wave_settings.total_enemy_counts_per_wave;
        this.spawn_delay = wave_settings.spawn_delay
        this.spawn_distances = wave_settings.spawn_distances;

        this.game_state_enum = {
            WAVE_RESET: 0,
            IDLE : 1,
            WAVE_BEGINNING : 2,
            WAVE_IN_PROGRESS : 3,
            WAVE_END : 4,
        };

        //audio
        this.breakBox = new Audio('/src/assets/audio/break.mp3');
        this.breakBox.volume = 0.4
        this.arrowShot = new Audio('/src/assets/audio/arrow_shot.mp3')
        this.arrowShot.volume = 0.3

    }

    game_reset(t, dt){
        this.state = this.game_state_enum.WAVE_RESET;
        this.game_time = 0; 
        this.game_tip_enabled = false;


        this.UI_data.weapon_ui_variation = 0;
        this.wave_progress = 0.0;
        this.displaying_progress = false;
        this.cur_enemy_count = 0;
        this.cur_enemy_counts = [0, 0, 0];
        this.cur_enemy_killed = 0;
        this.wave_count = 0;
        this.amount_of_enemies_to_spawn = 1.0;
        this.tank_spawn_angles = [];

        //remove enemies
        this.instances.forEach(instance => {
            if (instance == undefined || !(instance instanceof Enemy || instance instanceof BoltPickup ||
                instance.type == GameInstance_tool.type_enum.HARPOON_PROJECTILE
            )) return;
            this.remove_instance(instance.id);
        });
        
        //remove player, weapon and controller
        this.remove_instance(this.player.weapon.id);
        this.remove_instance(this.player.id);
        this.loader.render_scene.removeChild(this.camera);
        
        this.reload_player = true;
        this.game_reset_timer = t + this.game_reset_length;
        this.game_reset_flag = false;
    }

    update(t, dt){
        if (this.game_reset_flag == true){
            this.game_reset(t, dt);
            return;
        } else if (this.game_reset_flag == false && t < this.game_reset_timer){
            return;
        } else if (this.reload_player == true){
            this.loadPlayer();
            this.reload_player = false;
            return;
        }

        this.game_time += dt; 

        switch (this.state){
            case this.game_state_enum.WAVE_RESET:
                this.create_instance(GameInstance_tool.type_enum.CRATE, [0,0], 20, 0);
                this.state = this.game_state_enum.IDLE;
                break;
            case this.game_state_enum.IDLE:
                break;
            case this.game_state_enum.WAVE_BEGINNING:
                //disable the game tip
                this.game_tip_enabled = false;
                this.bolt_tip_enabled = false;

                //setting up data for wave
                this.displaying_progress = true;
                this.wave_progress = 0.0;
                this.wave_count++;


                const wave_id = this.wave_count < 12 ? this.wave_count : 11;
                const cur_total_enemy_counts = this.total_enemy_counts_per_wave[wave_id];

                if (this.wave_count > 11){
                    vec3.scale(cur_total_enemy_counts, cur_total_enemy_counts, 1.5 * (this.wave_count - 11));
                    cur_total_enemy_counts[0] = Math.floor(cur_total_enemy_counts[0])
                    cur_total_enemy_counts[1] = Math.floor(cur_total_enemy_counts[1])
                    cur_total_enemy_counts[2] = Math.floor(cur_total_enemy_counts[2])
                }
                this.cur_total_enemy_counts = cur_total_enemy_counts;
                this.total_enemy_count = cur_total_enemy_counts[0] + cur_total_enemy_counts[1] + cur_total_enemy_counts[2];
                
                //start next wave
                this.state = this.game_state_enum.WAVE_IN_PROGRESS;
                break;
            case this.game_state_enum.WAVE_IN_PROGRESS:

                if (this.cur_enemy_count < this.total_enemy_count) this.spawn_enemies(dt);
                if (this.cur_enemy_killed == this.total_enemy_count){
                    this.state = this.game_state_enum.WAVE_END;
                }
                break;
            case this.game_state_enum.WAVE_END:
                this.displaying_progress = false;
                this.wave_progress = 0.0;
                this.cur_enemy_killed = 0;
                this.cur_enemy_count = 0;
                this.cur_enemy_counts = [0, 0, 0];
                this.amount_of_enemies_to_spawn = 1;
                this.state = this.game_state_enum.WAVE_RESET;
                this.tank_spawn_angles = [];

                if (this.wave_count == 1){
                    this.bolt_tip_enabled = true;
                    this.bolt_tip_animation_duration = t;
                }
                break;
            default:
                console.log("game stateless error");
        }

        this.physics.update(t, dt);
        this.update_scene(t, dt);
    }

    spawn_enemies(dt){
        
        this.amount_of_enemies_to_spawn += dt * 1000 / this.spawn_delay;
        if (this.amount_of_enemies_to_spawn < 0) this.amount_of_enemies_to_spawn = this.total_enemy_count - this.cur_enemy_count;

        const cur_total_enemy_counts = this.cur_total_enemy_counts;

        for (let i = 0; i < this.amount_of_enemies_to_spawn - 1; i++) {
            
            let enemy_to_spawn;
            if (this.cur_enemy_counts[2] < cur_total_enemy_counts[2]) {
                // If tanks should be spawned, spawn them first
                enemy_to_spawn = 2;
            } else if (this.cur_enemy_counts[1] >= cur_total_enemy_counts[1]) {
                enemy_to_spawn = 0;
            } else if (this.cur_enemy_counts[0] >= cur_total_enemy_counts[0]) {
                enemy_to_spawn = 1;
            } else {
                enemy_to_spawn = Math.floor(Math.random() * 2);
            }

            let angle;
            if (this.tank_spawn_angles.length === 0 || enemy_to_spawn === 2 || Math.random() > wave_settings.chance_to_spawn_near_tank) {
                // If no tanks exist, is spawning a tank, or a dice roll decides, spawn the enemy anywhere
                angle = Math.random() * 2 * Math.PI;
            } else {
                // If a tank is spawned in the current wave, choose one
                const chosen_tank = Math.floor(Math.random() * this.tank_spawn_angles.length);
                angle = this.tank_spawn_angles[chosen_tank];
                // Slightly offset chosen angle
                const max_angle_offset = 20 * Math.PI / 180;
                angle += (Math.random() * max_angle_offset * 2) - max_angle_offset;
            }

            const distance = this.spawn_distances[enemy_to_spawn] + ((Math.random() * 4) - 2);

            const spawn_location = [
                Math.cos(angle) * distance + this.player.world_position[0],
                Math.sin(angle) * distance + this.player.world_position[1]
            ];
            
            let type;
            switch (enemy_to_spawn) {
                case 0:
                    type = GameInstance_tool.type_enum.ENEMY_STANDARD;
                    break;
                case 1:
                    type = GameInstance_tool.type_enum.ENEMY_FAST;
                    break;
                case 2:
                    type = GameInstance_tool.type_enum.ENEMY_TANK;
                    break;
                default:
                    console.error("Something must have gone horribly wrong, this shouldn't ever be outputed");
            }

            this.spawn_enemy(type, spawn_location[0], spawn_location[1], 0);
            this.cur_enemy_counts[enemy_to_spawn]++;

            if (enemy_to_spawn === 2) this.tank_spawn_angles.push(angle);

            this.cur_enemy_count++;

        }

        this.amount_of_enemies_to_spawn %= 1;
        

    }

    bolt_pickup_event(){
        
    }

    enemy_death_event(id, type){
        this.cur_enemy_killed += 1;
        this.wave_progress = (this.cur_enemy_killed / this.total_enemy_count);
    }
   
    crate_break_event(x, y){
        this.breakBox.play();
        this.state = this.game_state_enum.WAVE_BEGINNING;
        if (wave_settings.bolt_spawn_waves.includes(this.wave_count)) this.create_instance(GameInstance_tool.type_enum.BOLT_PICKUP, [x, y], 1.5, 0);
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
        this.player = await this.create_instance(GameInstance_tool.type_enum.PLAYER, [6,6], -0.3, 0);
        this.loader.loadController(this);
        this.player.weapon = await this.create_instance(GameInstance_tool.type_enum.HARPOON_EMPTY, [0,0], 1, 0);
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