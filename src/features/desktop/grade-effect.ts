import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import type { Grade } from './logic/grade.js';

const DECLARATIONS = `
uniform float brightness;
uniform float warmth;
uniform float saturation;
`;

// Colours are premultiplied: the result stays within the alpha.
const CODE = `
vec3 c = cogl_color_out.rgb;
float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
c = mix(vec3(l), c, saturation);
c *= vec3(1.0 + warmth, 1.0 + warmth * 0.3, 1.0 - warmth);
cogl_color_out.rgb = clamp(c * brightness, 0.0, cogl_color_out.a);
`;

/**
 * Grades a desktop picture: brightness, a warm or cool shift and saturation.
 *
 * It draws the picture again on every paint instead of keeping the last
 * one. An offscreen effect keeps its picture until the actor queues a
 * redraw, and each monitor has its own frame clock: when another monitor's
 * view painted first, mutter had clipped the wallpaper to that view's
 * redraw area (for the actor at the stage origin, the monitor left of the
 * primary one), so the kept picture was empty and that monitor showed no
 * wallpaper.
 */
export const GradeEffect = GObject.registerClass(
    class GradeEffect extends Shell.GLSLEffect {
        override vfunc_build_pipeline(): void {
            this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, DECLARATIONS, CODE, false);
        }

        override vfunc_paint(node: Clutter.PaintNode, paintContext: Clutter.PaintContext, flags: Clutter.EffectPaintFlags): void {
            super.vfunc_paint(node, paintContext, flags | Clutter.EffectPaintFlags.ACTOR_DIRTY);
        }

        setGrade(grade: Grade): void {
            this.set_uniform_float(this.get_uniform_location('brightness'), 1, [grade.brightness]);
            this.set_uniform_float(this.get_uniform_location('warmth'), 1, [grade.warmth]);
            this.set_uniform_float(this.get_uniform_location('saturation'), 1, [grade.saturation]);
            this.queue_repaint();
        }
    },
);

export type GradeEffect = InstanceType<typeof GradeEffect>;
