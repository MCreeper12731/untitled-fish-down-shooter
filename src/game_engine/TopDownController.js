import { quat, vec2, vec3 } from 'glm';

import { Transform } from 'engine/core.js';

const States = Object.freeze({
    IDLE: {name: "idle", minTime: -1},
    MOVING: {name: "moving", minTime: -1},
    ATTACKING: {name: "attacking", minTime: 0.5},
    RELOADING: {name: "reloading", minTime: 5},
});

export class TopDownController {

    constructor(game_instance, camera, canvas, {
            cam_properties = {
                cam_elevation : 25,
                cam_offset : [15, 0],
            },
            dash = {
                cooldown_total : 1,
                cooldown_left : 0,
                speed_increase : 10,
                speed_increase_duration : 0.1,
            },
            keymap = {
                "MouseLeft": States.ATTACKING,
                "KeyR": States.RELOADING,
            },
            diabolical = false,
        } = {}
    ) {
        // Initialization of Node and Camera 
        this.game_instance = game_instance;
        this.camera = camera;
        let angle_y = this.init_camera(cam_properties);
        this.rotation_offset = {
            sin: Math.sin(angle_y),
            cos: Math.cos(angle_y),
        }

        // Initialization of static variables
        this.canvas = canvas;
        this.keymap = keymap;
        this.cam_offset = cam_properties.cam_offset;
        this.diabolical = diabolical;
        
        // Initialization of state variables
        this.state = {
            value: States.IDLE,
            time: 0.0,
        };
        this.dash = dash;
        this.keys = {};
        
        this.init_event_handlers();
    }

    init_camera(cam_properties) {

        let cam_transform = this.camera.getComponentOfType(Transform);

        cam_transform.translation = [
            this.game_instance.world_position[0] - cam_properties.cam_offset[0],
            cam_properties.cam_elevation,
            this.game_instance.world_position[1] - cam_properties.cam_offset[1]
        ];

        // Voodoo angle magic. Do not touch unless you know a better way to do this. It's shit but this shit got legs and it runs
        // Idea: rotate around y axis and then around x
        // Reality: 
        //  - y axis angle has to be reversed in a very specific scenario??
        //  - z axis angle has to be pi radians ?????
        let vector_end = vec3.create();
        vec3.subtract(
            vector_end,
            [this.game_instance.world_position[0], 0, this.game_instance.world_position[1]],
            cam_transform.translation
        );
        vec3.normalize(vector_end, vector_end);

        let vector_flat = [-cam_properties.cam_offset[0], 0, -cam_properties.cam_offset[1]];
        vec3.normalize(vector_flat, vector_flat);
        
        let angle_y = Math.acos(vec3.dot([0, 0, -1], vector_flat));
        angle_y = cam_properties.cam_offset[0] < 0 ? -angle_y : angle_y
        let angle_x = Math.acos(vec3.dot(vector_flat, vector_end));
        let rotation = quat.create();
        quat.rotateY(rotation, rotation, angle_y);
        quat.rotateX(rotation, rotation, -angle_x);
        quat.rotateZ(rotation, rotation, Math.PI);
        cam_transform.rotation = rotation;

        // Rotation offset for movement and mouse follow
        return angle_y;
    }

    init_event_handlers() {

        const doc = this.canvas.ownerDocument;
        
        doc.addEventListener('pointermove', event => this.pointermove_handler(event));
        doc.addEventListener('mousedown', event => this.mousedown_handler(event));
        doc.addEventListener('mouseup', event => this.mouseup_handler(event));
        doc.addEventListener('keydown', event => this.keydown_handler(event));
        doc.addEventListener('keyup', event => this.keyup_handler(event));


    }

    update(t, dt) {

        this.updateState(t, dt);

        this.calculate_acceleration(t, dt);        
        
        if (this.diabolical) {
            const x_angle = Math.atan2(this.game_instance.facing_direction[0], this.game_instance.facing_direction[1]);
            
            this.cam_offset_alt = [
                this.cam_offset[0] * Math.cos(x_angle) - this.cam_offset[1] * Math.sin(x_angle),
                this.cam_offset[0] * Math.sin(x_angle) + this.cam_offset[1] * Math.cos(x_angle),
            ];

            
            this.init_camera({cam_elevation: 25, cam_offset: this.cam_offset_alt});
        }

        // Update camera position based on node
        const camTransform = this.camera.getComponentOfType(Transform);

        
        if (!this.diabolical) {
            camTransform.translation = [
                this.game_instance.world_position[0] - this.cam_offset[0],
                camTransform.translation[1],
                this.game_instance.world_position[1] - this.cam_offset[1]
            ];
        }

    }

    updateState(t, dt) {
        for (const property in this.keymap) {
            if (this.keys[property] && this.state.value == States.IDLE) {
                this.state.value = this.keymap[property];
                this.state.time = 0;
            } else {
                
            }
            if (this.state.time > this.state.value.minTime) {
                this.state.value = States.IDLE;
                this.state.time = 0;
            }
        }
        this.state.time += dt;
    }

    calculate_acceleration(t, dt) {
        const forward = [this.rotation_offset.sin, this.rotation_offset.cos];
        const right = [-this.rotation_offset.cos, this.rotation_offset.sin];

        const acceleration_2d = vec2.create();
        if (this.keys['KeyW']) {
            vec2.add(acceleration_2d, acceleration_2d, forward);
        }
        if (this.keys['KeyS']) {
            vec2.sub(acceleration_2d, acceleration_2d, forward);
        }
        if (this.keys['KeyD']) {
            vec2.add(acceleration_2d, acceleration_2d, right);
        }
        if (this.keys['KeyA']) {
            vec2.sub(acceleration_2d, acceleration_2d, right);
        }
        if (this.keys['ShiftLeft'] && this.dash.cooldown_left <= 0) {
            this.dash.cooldown_left = this.dash.cooldown_total;
        }

        vec2.normalize(acceleration_2d, acceleration_2d);
        vec2.scale(acceleration_2d, acceleration_2d, 0.05);
        
        let node_properties = this.game_instance.properties;

        if (this.dash.cooldown_total - this.dash.cooldown_left < this.dash.speed_increase_duration) {
            vec2.scale(acceleration_2d, acceleration_2d, this.dash.speed_increase);
            node_properties.can_bypass_max_speed = true;
        } else {
            node_properties.can_bypass_max_speed = false;
        }
        if (this.dash.cooldown_left > 0) this.dash.cooldown_left -= dt;
        
        node_properties.acceleration_2d = acceleration_2d;
    }

    mousedown_handler(event) {
        switch (event.which) {
            case 1:
                this.keys["MouseLeft"] = true;
                return;
            case 2:
                this.keys["MouseMiddle"] = true;
                return;
            case 3:
                this.keys["MouseRight"] = true;
        }
    }

    mouseup_handler(event) {
        switch (event.which) {
            case 1:
                this.keys["MouseLeft"] = false;
                return;
            case 2:
                this.keys["MouseMiddle"] = false;
                return;
            case 3:
                this.keys["MouseRight"] = false;
        }
    }

    pointermove_handler(event) {
        
        let facing_direction = [
            -1.0 + 2.0 * event.x / event.srcElement.clientWidth,
            1.0 - 2.0 * event.y / event.srcElement.clientHeight,
        ]

        vec2.normalize(facing_direction, facing_direction);
        
        this.game_instance.facing_direction = [
            facing_direction[0] * this.rotation_offset.cos - facing_direction[1] * this.rotation_offset.sin,
            facing_direction[0] * this.rotation_offset.sin + facing_direction[1] * this.rotation_offset.cos,
        ];

    }

    keydown_handler(event) {
        this.keys[event.code] = true;
    }

    keyup_handler(event) {
        this.keys[event.code] = false;
    }
    
}