// Three.js 只支持 WebGL2；规范保证至少 16 个顶点属性。
const MIN_VERTEX_ATTRIBS = 16

/** 仅保护此预览的 context，不改全局原型，也不读取 GPU 像素。 */
export function prepareSkinWebGLContext(gl) {
  const getParameter = gl.getParameter.bind(gl)
  const bufferData = gl.bufferData.bind(gl)
  const bufferSubData = gl.bufferSubData.bind(gl)
  const previousBuffer = getParameter(gl.ARRAY_BUFFER_BINDING)
  const probeBuffer = gl.createBuffer()
  if (!probeBuffer) throw new Error('无法初始化 WebGL 缓冲区。')

  let protectedUpload = false
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, probeBuffer)
    // 已确认的扩展会原地改写传入数组。只在初始化时检测两次，避免一次随机噪声
    // 小到被 Float32 舍入掉而漏检；正常浏览器仅上传两份 64 字节的测试数据。
    for (let attempt = 0; attempt < 2 && !protectedUpload; attempt++) {
      const probe = new Float32Array(16).fill(1)
      bufferData(gl.ARRAY_BUFFER, probe, gl.STATIC_DRAW)
      protectedUpload = probe.some(value => value !== 1)
    }
  } finally {
    gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer)
    gl.deleteBuffer(probeBuffer)
  }

  // 不相信随机返回的能力值。使用 WebGL2 保证的安全下限，防止 Three.js
  // 将 color 属性当成超出范围而不启用；其它参数仍交给原方法。
  gl.getParameter = function (parameter) {
    return parameter === gl.MAX_VERTEX_ATTRIBS ? MIN_VERTEX_ATTRIBS : getParameter(parameter)
  }

  if (protectedUpload) {
    // bufferData(字节数) 不传入可被污染的数组，再由未被此扩展拦截的
    // bufferSubData 上传原始字节。正常浏览器不替换 bufferData，保留原上传路径。
    gl.bufferData = function (target, data, usage, ...range) {
      if (!ArrayBuffer.isView(data)) return bufferData(target, data, usage, ...range)
      const bytesPerElement = data.BYTES_PER_ELEMENT || 1
      const sourceOffset = (range[0] || 0) * bytesPerElement
      const byteLength = range[1] ? range[1] * bytesPerElement : data.byteLength - sourceOffset
      const bytes = new Uint8Array(data.buffer, data.byteOffset + sourceOffset, byteLength)
      bufferData(target, byteLength, usage)
      bufferSubData(target, 0, bytes)
    }
  }

  return { protectedUpload }
}
