"use client";

import { useEffect, useRef } from "react";

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `
precision mediump float;
uniform float t;
uniform vec2 res;

vec3 pal(float x){
  return vec3(0.04,0.04,0.12)+vec3(0.03,0.05,0.10)*cos(6.283*(vec3(0.06,0.36,0.50)*x+vec3(0.3,0.5,0.9)));
}

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*res)/min(res.x,res.y);
  vec2 uv0=uv;
  vec3 col=vec3(0.);
  for(int i=0;i<3;i++){
    uv=fract(uv*1.6)-.5;
    float d=length(uv)*exp(-length(uv0));
    vec3 c=pal(length(uv0)+float(i)*0.38+t*0.035);
    d=sin(d*8.+t*.25)/8.;
    d=abs(d);
    d=pow(.008/d,1.1);
    col+=c*d;
  }
  gl_FragColor=vec4(col*.45,1.);
}`;

export function ShaderBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const mkShader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uT = gl.getUniformLocation(prog, "t");
    const uR = gl.getUniformLocation(prog, "res");
    const t0 = performance.now();
    let raf: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Draw once, static (no animation loop to avoid browser hang in preview)
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uT, 0);
    gl.uniform2f(uR, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    let last = 0;
    const FPS = 12;
    const INTERVAL = 1000 / FPS;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < INTERVAL) return;
      last = now;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas ref={ref} aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: -10, opacity: 0.85 }} />
  );
}
