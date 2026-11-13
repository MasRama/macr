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

/** Grades a desktop picture: brightness, a warm or cool shift and saturation. */
export const GradeEffect = GObject.registerClass(
    class GradeEffect extends Shell.GLSLEffect {
        override vfunc_build_pipeline(): void {
            this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, DECLARATIONS, CODE, false);
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
