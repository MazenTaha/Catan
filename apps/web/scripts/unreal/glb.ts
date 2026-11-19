import { readFile } from 'node:fs/promises';
import type { BufferGeometry } from 'three';

interface View {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}
interface Accessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
  sparse?: unknown;
}
interface Primitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  targets?: unknown;
}
interface Node {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  skin?: number;
  extras?: Record<string, unknown>;
}
interface Document {
  asset: { version: string; generator?: string };
  scene: number;
  scenes: { name: string; nodes: number[] }[];
  nodes: Node[];
  meshes: { name?: string; primitives: Primitive[] }[];
  accessors: Accessor[];
  bufferViews: View[];
  buffers: { byteLength: number; uri?: string }[];
  materials: Record<string, unknown>[];
  textures: { source?: number; sampler?: number }[];
  images: { bufferView: number; mimeType: string; name?: string }[];
  samplers: Record<string, unknown>[];
  extensionsUsed: string[];
  extensionsRequired?: string[];
}

export async function readGlb(path: string): Promise<{ doc: Document; bin: Buffer }> {
  const bytes = await readFile(path);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2)
    throw new Error(`Not a glTF 2 GLB: ${path}`);
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Truncated GLB: ${path}`);
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`Missing JSON: ${path}`);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + length)) as Document;
  const offset = 20 + length;
  if (bytes.readUInt32LE(offset + 4) !== 0x004e4942) throw new Error(`Missing BIN: ${path}`);
  const bin = bytes.subarray(offset + 8, offset + 8 + bytes.readUInt32LE(offset));
  if (doc.buffers.length !== 1 || doc.buffers[0].uri)
    throw new Error(`Expected one embedded buffer: ${path}`);
  return { doc, bin };
}

/** Combine original GLBs without decoding textures or losing vertex colours and UVs. */
export class IslandGlb {
  readonly doc: Document = {
    asset: { version: '2.0', generator: 'Catan Night Unreal island exporter' },
    scene: 0,
    scenes: [{ name: 'CatanNightIsland', nodes: [] }],
    nodes: [],
    meshes: [],
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
    materials: [],
    textures: [],
    images: [],
    samplers: [],
    extensionsUsed: [],
  };
  private chunks: Buffer[] = [];
  private byteLength = 0;
  private templates = new Map<string, { source: Document; index: number; meshOffset: number }>();

  get templateNames(): string[] {
    return [...this.templates.keys()];
  }

  private append(bytes: Buffer): number {
    const start = this.byteLength;
    const padding = Buffer.alloc((4 - (bytes.length % 4)) % 4);
    this.chunks.push(bytes, padding);
    this.byteLength += bytes.length + padding.length;
    return start;
  }

  async addFamily(path: string, family: string) {
    const { doc: source, bin } = await readGlb(path);
    if (source.extensionsRequired?.length)
      throw new Error(`Unsupported required GLB extensions in ${family}`);
    const offset = {
      bytes: this.append(bin),
      view: this.doc.bufferViews.length,
      accessor: this.doc.accessors.length,
      material: this.doc.materials.length,
      mesh: this.doc.meshes.length,
      texture: this.doc.textures.length,
      image: this.doc.images.length,
      sampler: this.doc.samplers.length,
    };
    this.doc.bufferViews.push(
      ...source.bufferViews.map((v) => ({
        ...v,
        buffer: 0,
        byteOffset: (v.byteOffset ?? 0) + offset.bytes,
      })),
    );
    this.doc.accessors.push(
      ...source.accessors.map((a) => {
        if (a.sparse) throw new Error(`Sparse accessor in ${family}`);
        return { ...a, bufferView: a.bufferView + offset.view };
      }),
    );
    this.doc.images.push(
      ...(source.images ?? []).map((i) => ({ ...i, bufferView: i.bufferView + offset.view })),
    );
    this.doc.samplers.push(...(source.samplers ?? []));
    this.doc.textures.push(
      ...(source.textures ?? []).map((t) => ({
        ...t,
        source: t.source === undefined ? undefined : t.source + offset.image,
        sampler: t.sampler === undefined ? undefined : t.sampler + offset.sampler,
      })),
    );
    // TextureInfo can occur inside a material extension as well as the standard PBR fields.
    const remapTextures = (value: unknown, key = ''): unknown => {
      if (!value || typeof value !== 'object') return value;
      if (Array.isArray(value)) return value.map((v) => remapTextures(v));
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          k === 'index' && key.endsWith('Texture') && typeof v === 'number'
            ? v + offset.texture
            : remapTextures(v, k),
        ]),
      );
    };
    this.doc.materials.push(
      ...(source.materials ?? []).map((m) => ({
        ...(remapTextures(m) as Record<string, unknown>),
        name: `${family}_${m.name}`,
      })),
    );
    this.doc.meshes.push(
      ...source.meshes.map((m) => ({
        name: `${family}_${m.name}`,
        primitives: m.primitives.map((p) => {
          if (p.targets) throw new Error(`Morph targets require a separate export: ${family}`);
          return {
            ...p,
            attributes: Object.fromEntries(
              Object.entries(p.attributes).map(([k, v]) => [k, v + offset.accessor]),
            ),
            indices: p.indices === undefined ? undefined : p.indices + offset.accessor,
            material: p.material === undefined ? undefined : p.material + offset.material,
          };
        }),
      })),
    );
    for (const root of source.scenes[source.scene ?? 0].nodes) {
      const name = source.nodes[root].name;
      if (!name) throw new Error(`Unnamed model root in ${family}`);
      this.templates.set(`${family}/${name}`, { source, index: root, meshOffset: offset.mesh });
    }
    this.doc.extensionsUsed = [
      ...new Set([...this.doc.extensionsUsed, ...(source.extensionsUsed ?? [])]),
    ];
  }

  place(template: string, name: string, position: number[], yaw = 0, scale = 1): number {
    const spec = this.templates.get(template);
    if (!spec) throw new Error(`Missing model: ${template}`);
    const copy = (index: number, root: boolean): number => {
      const node = structuredClone(spec.source.nodes[index]);
      if (node.skin !== undefined)
        throw new Error('Skinned assets need a separate character migration');
      if (node.mesh !== undefined) node.mesh += spec.meshOffset;
      if (node.children) node.children = node.children.map((child) => copy(child, false));
      if (root) {
        // Match the web loader: file root transforms are Blender's asset-gallery layout.
        delete node.matrix;
        node.name = name;
        node.translation = position;
        node.rotation = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
        node.scale = [scale, scale, scale];
        node.extras = { sourceAsset: template };
      } else node.name = `${name}_${node.name ?? index}`;
      return this.doc.nodes.push(node) - 1;
    };
    const root = copy(spec.index, true);
    this.doc.scenes[0].nodes.push(root);
    return root;
  }

  material(name: string, color: number[], roughness = 0.9): number {
    return (
      this.doc.materials.push({
        name,
        pbrMetallicRoughness: {
          baseColorFactor: [...color, 1],
          metallicFactor: 0,
          roughnessFactor: roughness,
        },
      }) - 1
    );
  }

  geometry(name: string, geometry: BufferGeometry, material: number, position: number[]) {
    const attributes: Record<string, number> = {};
    for (const [source, target] of Object.entries({
      position: 'POSITION',
      normal: 'NORMAL',
      color: 'COLOR_0',
      uv: 'TEXCOORD_0',
    })) {
      const attr = geometry.getAttribute(source);
      if (!attr) continue;
      const data = Float32Array.from({ length: attr.count * attr.itemSize }, (_, i) =>
        attr.getComponent(Math.floor(i / attr.itemSize), i % attr.itemSize),
      );
      const view =
        this.doc.bufferViews.push({
          buffer: 0,
          byteOffset: this.append(Buffer.from(data.buffer)),
          byteLength: data.byteLength,
        }) - 1;
      const accessor: Accessor = {
        bufferView: view,
        componentType: 5126,
        count: attr.count,
        type: `VEC${attr.itemSize}`,
      };
      if (source === 'position') {
        geometry.computeBoundingBox();
        accessor.min = geometry.boundingBox!.min.toArray();
        accessor.max = geometry.boundingBox!.max.toArray();
      }
      attributes[target] = this.doc.accessors.push(accessor) - 1;
    }
    const index = geometry.getIndex();
    if (!index) throw new Error(`Indexed geometry required: ${name}`);
    const data = Uint32Array.from(index.array);
    const view =
      this.doc.bufferViews.push({
        buffer: 0,
        byteOffset: this.append(Buffer.from(data.buffer)),
        byteLength: data.byteLength,
      }) - 1;
    const indices =
      this.doc.accessors.push({
        bufferView: view,
        componentType: 5125,
        count: data.length,
        type: 'SCALAR',
      }) - 1;
    const mesh =
      this.doc.meshes.push({ name, primitives: [{ attributes, indices, material }] }) - 1;
    const node = this.doc.nodes.push({ name, mesh, translation: position }) - 1;
    this.doc.scenes[0].nodes.push(node);
    geometry.dispose();
  }

  build(): Buffer {
    this.doc.buffers[0].byteLength = this.byteLength;
    const json = Buffer.from(JSON.stringify(this.doc));
    const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + padded.length + this.byteLength, 8);
    header.writeUInt32LE(padded.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(this.byteLength, 0);
    binHeader.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([header, padded, binHeader, ...this.chunks]);
  }
}
