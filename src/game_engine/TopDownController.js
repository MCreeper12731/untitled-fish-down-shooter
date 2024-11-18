import { quat, vec2, vec3 } from 'glm';

import { Transform } from '../core/Transform.js';

const States = Object.freeze({
    IDLE: {name: "idle", minTime: -1},
    MOVING: {name: "moving", minTime: -1},
    ATTACKING: {name: "attacking", minTime: 0.5},
    RELOADING: {name: "reloading", minTime: 5},
});

export class TopDownController {

    constructor(
        node,
        camera,
        dom_element,
        {
            elevation = 15,
            keymap = {
                "MouseLeft": States.ATTACKING,
                "KeyR": States.RELOADING,
            },
            camOffset = [-10, -10],
        } = {}
    ) {
        this.node = node;
        this.camera = camera;

        let nodeTransform = this.node.getComponentOfType(Transform);
        let camTransform = this.camera.getComponentOfType(Transform);
        camTransform.translation = [nodeTransform.translation[0] - camOffset[0], elevation, nodeTransform.translation[2] - camOffset[1]];

        let endVector = vec3.create();
        vec3.subtract(endVector, nodeTransform.translation, camTransform.translation);
        vec3.normalize(endVector, endVector);

        let yVector = [-camOffset[0], 0, -camOffset[1]];
        vec3.normalize(yVector, yVector);

        let angleY = Math.acos(vec3.dot([0, 0, -1], yVector));
        angleY = camOffset[0] < 0 ? -angleY : angleY
        let angleX = Math.acos(vec3.dot(yVector, endVector));
        let rotation = quat.create();
        quat.rotateY(rotation, rotation, angleY, 0);
        quat.rotateX(rotation, rotation, -angleX);
        quat.rotateZ(rotation, rotation, Math.PI);
        camTransform.rotation = rotation;

        this.rotationOffsetY = angleY;

        this.dom_element = dom_element;
        this.keymap = keymap;
        this.state = {
            value: States.IDLE,
            time: 0.0,
        };
        this.camOffset = camOffset;
        
        this.dash = {
            cooldownTotal: 1,
            cooldownLeft: 0.0,
            speedIncrease: 10,
            speedIncreaseDuration: 0.1, // feels very good with 1 / speedIncrease
        }
        this.keys = {};
        this.face_dir_2D = [1, 0];
        this.velocity = [0, 0, 0],
        this.acceleration = 1000,
        this.decay = 0.99;
        this.maxSpeed = 10;

        this.init_event_handlers();
    }

    init_event_handlers() {

        this.pointermoveHandler = this.pointermoveHandler.bind(this);
        this.mousedownHandler = this.mousedownHandler.bind(this);
        this.mouseupHandler = this.mouseupHandler.bind(this);
        this.keydownHandler = this.keydownHandler.bind(this);
        this.keyupHandler = this.keyupHandler.bind(this);

        const element = this.dom_element;
        const doc = element.ownerDocument;

        doc.addEventListener('pointermove', this.pointermoveHandler);
        doc.addEventListener('mousedown', this.mousedownHandler);
        doc.addEventListener('mouseup', this.mouseupHandler);
        doc.addEventListener('keydown', this.keydownHandler);
        doc.addEventListener('keyup', this.keyupHandler);

    }

    update(t, dt) {
        
        this.updateStates(t, dt);

        this.calculate(t, dt);        

        const nodeTransform = this.node.getComponentOfType(Transform);
        const camTransform = this.camera.getComponentOfType(Transform);

        if (nodeTransform && camTransform) {
            vec3.scaleAndAdd(nodeTransform.translation, nodeTransform.translation, this.velocity, dt);

            camTransform.translation = [
                nodeTransform.translation[0] - this.camOffset[0],
                camTransform.translation[1],
                nodeTransform.translation[2] - this.camOffset[1]
            ];
            
            let angle = this.face_dir_2D[0] == 0 && this.face_dir_2D[1] == 0 ? 0 : Math.atan(this.face_dir_2D[1] / this.face_dir_2D[0]);
            
            const rotation = quat.create();
            quat.rotateY(rotation, rotation, angle + this.rotationOffsetY);
            nodeTransform.rotation = rotation;
        } else {
            console.error("You likely forgot to add Transform components to camera and/or node!")
        }

    }

    updateStates(t, dt) {
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

    calculate(t, dt) {
        const forward = [Math.sin(this.rotationOffsetY), 0, Math.cos(this.rotationOffsetY)];
        const right = [-Math.cos(this.rotationOffsetY), 0, Math.sin(this.rotationOffsetY)];

        const acc = vec3.create();
        if (this.keys['KeyW']) {
            vec3.add(acc, acc, forward);
        }
        if (this.keys['KeyS']) {
            vec3.sub(acc, acc, forward);
        }
        if (this.keys['KeyD']) {
            vec3.add(acc, acc, right);
        }
        if (this.keys['KeyA']) {
            vec3.sub(acc, acc, right);
        }
        if (this.keys['ShiftLeft'] && this.dash.cooldownLeft <= 0) {
            this.dash.cooldownLeft = this.dash.cooldownTotal;
        }


        vec3.normalize(acc, acc);
        vec3.scale(acc, acc, 0.05);
        if (this.dash.cooldownTotal - this.dash.cooldownLeft < this.dash.speedIncreaseDuration) {
            vec3.scale(acc, acc, this.dash.speedIncrease);
        }

        if (this.dash.cooldownLeft > 0)
            this.dash.cooldownLeft -= dt;

        const speed = vec3.length(this.velocity);
        if (speed < this.maxSpeed || this.dash.cooldownTotal - this.dash.cooldownLeft < this.dash.speedIncreaseDuration) {
            vec3.scaleAndAdd(this.velocity, this.velocity, acc, dt * this.acceleration);
        }

        const decay = Math.exp(dt * Math.log(1 - this.decay));
        vec3.scale(this.velocity, this.velocity, decay);

        if (vec3.squaredLength(this.velocity) < 0.0001) {
            vec3.zero(this.velocity)
        }

        
    }

    mousedownHandler(event) {
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

    mouseupHandler(event) {
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

    pointermoveHandler(event) {
        let normalizedX = -1.0 + 2.0 * event.x / event.srcElement.clientWidth; 
        let normalizedY = 1.0 - 2.0 * event.y / event.srcElement.clientHeight;
        vec2.normalize(this.face_dir_2D, [normalizedX, normalizedY]);
    }

    keydownHandler(event) {
        this.keys[event.code] = true;
    }

    keyupHandler(event) {
        this.keys[event.code] = false;
    }
    
}