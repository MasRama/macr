import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

// `bounds` is the visible window inside the painted texture, in pixels;
// pixels outside it (invisible borders) are left as they are.
const DECLARATIONS = `
uniform vec4 bounds;
uniform float radius;
uniform vec2 size;

float macr_corner_coverage(vec2 p) {
    if (p.x < bounds.x || p.y < bounds.y || p.x > bounds.z || p.y > bounds.w)
        return 1.0;
    vec2 inner = clamp(p, bounds.xy + radius, bounds.zw - radius);
    return clamp(radius - distance(p, inner) + 0.5, 0.0, 1.0);
}
`;

const CODE = 'cogl_color_out *= macr_corner_coverage(cogl_tex_coord0_in.xy * size);';

/** Cuts a window's contents to a rounded rectangle, antialiased. */
export const CornerEffect = GObject.registerClass(
    class CornerEffect extends Shell.GLSLEffect {
        override vfunc_build_pipeline(): void {
            this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, DECLARATIONS, CODE, false);
        }

        /** The visible window's box inside a texture of `width` by `height`. */
        setShape(bounds: [number, number, number, number], radius: number, width: number, height: number): void {
            this.set_uniform_float(this.get_uniform_location('bounds'), 4, bounds);
            this.set_uniform_float(this.get_uniform_location('radius'), 1, [radius]);
            this.set_uniform_float(this.get_uniform_location('size'), 2, [width, height]);
            this.queue_repaint();
        }
    },
);

export type CornerEffect = InstanceType<typeof CornerEffect>;
