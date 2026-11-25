import { describe, expect, it } from 'vitest'
import { modelFilesInFolder } from '@/features/ai/engine'

const f = (path: string) => Object.assign(new File(['x'], path.split('/').pop()!), { webkitRelativePath: path })

describe('Instalar la IA desde una carpeta', () => {
  it('reconoce el paquete descomprimido (org/modelo/archivo)', () => {
    const r = modelFilesInFolder([f('ia/onnx-community/Qwen2.5-0.5B-Instruct/onnx/model_quantized.onnx'), f('ia/Xenova/multilingual-e5-small/tokenizer.json'), f('ia/sca-ia.json')])
    expect(r.map((x) => `${x.model}|${x.file}`)).toEqual(['onnx-community/Qwen2.5-0.5B-Instruct|onnx/model_quantized.onnx', 'Xenova/multilingual-e5-small|tokenizer.json'])
  })
  it('reconoce carpetas descargadas de Hugging Face e ignora lo demás', () => {
    const r = modelFilesInFolder([f('modelos/qwen2.5-0.5b-instruct/config.json'), f('modelos/qwen2.5-0.5b-instruct/.git/config'), f('modelos/multilingual-e5-small/README.md'), f('otro/config.json')])
    expect(r).toHaveLength(1)
    expect(r[0].file).toBe('config.json')
  })
})
