import { vec3, mat4, vec2 } from 'glm';
import { getGlobalModelMatrix } from 'engine/core/SceneUtils.js';
import { GameInstance_tool, Enemy } from './GameInstance.js';
import { Game } from './Game.js';

export class Physics {

    constructor(game) {
        this.game = game
    }

    update(t, dt) {
        this.game.instances.forEach(game_instance => {
            if (game_instance == undefined) return;

            if (game_instance.properties.is_dynamic) {
                this.game.instances.forEach(game_instance_other => {
                    if (game_instance_other == undefined) return;
                    if (game_instance !== game_instance_other && game_instance_other.properties.is_rigid) {
                        if (this.resolveCollision(game_instance, game_instance_other) === true){
                            GameInstance_tool.collision_decision(this.game, game_instance, game_instance_other);
                        }
                    }
                });
            }
        });

        this.map_bounds_collision(t, dt);
    }

    map_bounds_collision(t, dt){
        const player_bb = this.getTransformedAABB(this.game.player);
        const min = this.game.playable_area.min;
        const max = this.game.playable_area.max;
        const world_bb = {min, max};

        if (this.aabbIntersection(player_bb, world_bb) == true) return; 

        
        const player_pos = vec2.clone(this.game.player.world_position);
        vec2.normalize(player_pos, player_pos);
        vec2.scale(player_pos, player_pos, -dt);

        this.game.player.properties.velocity_2d = vec2.create();
        vec2.add(this.game.player.world_position, this.game.player.world_position, player_pos);

    }

    intervalIntersection(min1, max1, min2, max2) {
        return !(min1 > max2 || min2 > max1);
    }

    aabbIntersection(aabb1, aabb2) {
        return this.intervalIntersection(aabb1.min[0], aabb1.max[0], aabb2.min[0], aabb2.max[0])
            && this.intervalIntersection(aabb1.min[1], aabb1.max[1], aabb2.min[1], aabb2.max[1])
            && this.intervalIntersection(aabb1.min[2], aabb1.max[2], aabb2.min[2], aabb2.max[2]);
    }

    getTransformedAABB(game_instance) {
        // Transform all vertices of the AABB from local to global space.
        const matrix = getGlobalModelMatrix(game_instance.render_node);
        const { min, max } = game_instance.properties.bounding_box;
        const vertices = [
            [min[0], min[1], min[2]],
            [min[0], min[1], max[2]],
            [min[0], max[1], min[2]],
            [min[0], max[1], max[2]],
            [max[0], min[1], min[2]],
            [max[0], min[1], max[2]],
            [max[0], max[1], min[2]],
            [max[0], max[1], max[2]],
        ].map(v => vec3.transformMat4(v, v, matrix));

        // Find new min and max by component.
        const xs = vertices.map(v => v[0]);
        const ys = vertices.map(v => v[1]);
        const zs = vertices.map(v => v[2]);
        const newmin = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
        const newmax = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];
        return { min: newmin, max: newmax };
    }

    resolveCollision(game_instance_a, game_instance_b) {
        //ignore list
        if (game_instance_a.type == GameInstance_tool.type_enum.PLAYER && game_instance_b.type == GameInstance_tool.type_enum.HARPOON_PROJECTILE ||
            game_instance_b.type == GameInstance_tool.type_enum.PLAYER && game_instance_a.type == GameInstance_tool.type_enum.HARPOON_PROJECTILE ||
            game_instance_a instanceof Enemy && game_instance_b.type == GameInstance_tool.type_enum.BUBBLE_PROJECTILE ||
            game_instance_b instanceof Enemy && game_instance_a.type == GameInstance_tool.type_enum.BUBBLE_PROJECTILE ||
            game_instance_a.type == GameInstance_tool.type_enum.BOLT_PICKUP && game_instance_b.type == GameInstance_tool.type_enum.CRATE ||
            game_instance_b.type == GameInstance_tool.type_enum.BOLT_PICKUP && game_instance_a.type == GameInstance_tool.type_enum.CRATE
        ) 
        
        {
            return false;
        }

        // Get global space AABBs.
        if (!game_instance_a.properties.bounding_box || !game_instance_b.properties.bounding_box) return false;
        const aBox = this.getTransformedAABB(game_instance_a);
        const bBox = this.getTransformedAABB(game_instance_b);

        // Check if there is collision.
        const isColliding = this.aabbIntersection(aBox, bBox);
        if (!isColliding) {
            return false;
        }

        //during certain animations we want collision displacement to be turned off but collisions to still be detected
        if (game_instance_a.avoid_displacement == true || game_instance_b.avoid_displacement == true) {
            return true;
        }

        // Move node A minimally to avoid collision.
        const diffa = vec3.sub(vec3.create(), bBox.max, aBox.min);
        const diffb = vec3.sub(vec3.create(), aBox.max, bBox.min);

        let minDiff = Infinity;
        let minDirection = [0, 0];
        if (diffa[0] >= 0 && diffa[0] < minDiff) {
            minDiff = diffa[0];
            minDirection = [minDiff, 0];
        }
        if (diffa[2] >= 0 && diffa[2] < minDiff) {
            minDiff = diffa[2];
            minDirection = [0, minDiff];
        }
        if (diffb[0] >= 0 && diffb[0] < minDiff) {
            minDiff = diffb[0];
            minDirection = [-minDiff, 0];
        }
        if (diffb[2] >= 0 && diffb[2] < minDiff) {
            minDiff = diffb[2];
            minDirection = [0, -minDiff];
        }

        vec3.add(game_instance_a.world_position, game_instance_a.world_position, minDirection);
        return true;
    }

}
