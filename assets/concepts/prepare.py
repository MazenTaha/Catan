"""Copy the owner's reference sheets and only the installed Unreal input/controller logic.

Never changes E:/Catan_art_obj. No Epic mannequin, animation, texture or template level is copied.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
SHEETS = [
    ('knight', 'Knight character', ['knight/Knight']),
    ('swords', 'Sword variants', ['props/Sword']),
    ('trees', 'Trees and saplings', ['flora/Oak', 'flora/OakB', 'flora/Lime', 'flora/LimeB', 'flora/Spruce', 'flora/Fir', 'flora/Sapling']),
    ('cottages', 'Cottage A/B/C and door kit', ['concept_kit/CottageA', 'concept_kit/CottageB', 'concept_kit/CottageC']),
    ('undergrowth', 'Undergrowth and flowers', ['flora/ShrubA', 'flora/ShrubB', 'flora/GrassA', 'flora/GrassB', 'flora/Daisy', 'flora/Poppy', 'flora/Buttercup', 'flora/Lavender', 'flora/Reeds', 'props/MushRed', 'props/MushBrown']),
    ('harvest', 'Wheat and harvest', ['flora/WheatA', 'flora/WheatB', 'flora/WheatC', 'flora/Stook', 'village/HayBale']),
    ('woodland', 'Woodland worksite', ['props/StumpA', 'props/StumpB', 'props/AxeStump', 'props/LogPile', 'props/Log', 'props/Chips', 'props/Stakes']),
    ('rocks', 'Rocks and ore', ['rocks/BoulderA', 'rocks/BoulderB', 'rocks/BoulderC', 'rocks/CragA', 'rocks/CragB', 'rocks/CragC', 'rocks/OreFace', 'rocks/Ledge']),
    ('halls', 'Hall A/B/C', ['concept_kit/HallA', 'concept_kit/HallB', 'concept_kit/HallC']),
    ('windmills', 'Windmills and millstone', ['village/Mill', 'concept_kit/Millstone']),
    ('industry', 'Barn, kiln and mine', ['concept_kit/BarnA', 'village/Barn', 'village/Kiln', 'village/Mine']),
    ('bridges', 'Bridges, fences and troughs', ['concept_kit/BridgeA', 'concept_kit/BridgeB', 'props/FencePost', 'props/FenceRail', 'props/Gate', 'props/TroughA', 'props/TroughB', 'props/BrickStack']),
    ('harbours', 'Two-approach docks and boats', ['concept_kit/DockA', 'concept_kit/DockB', 'concept_kit/LandingStage', 'village/Boat', 'village/BoatSloop', 'village/BoatStriped']),
    ('furniture', 'Modular room furniture', ['concept_kit/Bed', 'concept_kit/CottageTable', 'concept_kit/LongTable', 'concept_kit/Bench', 'concept_kit/HallBench', 'concept_kit/Chair', 'concept_kit/Stool', 'concept_kit/Dresser', 'concept_kit/Shelf', 'props/Bookshelf']),
    ('storage', 'Hearth and mill storage', ['concept_kit/BarrelA', 'concept_kit/BarrelB', 'concept_kit/GrainSack', 'concept_kit/MillBin', 'concept_kit/Ladder', 'concept_kit/Millstone', 'concept_kit/StorageCrate']),
    ('heraldry', 'Textiles and heraldry', ['props/Banner', 'props/Tapestry']),
    ('decor', 'Kingdom furnishings', ['props/Antlers', 'props/CandleWheel', 'props/FloorPlant', 'props/TablePlant', 'props/ArmorStand', 'props/Candles', 'props/CrossedShields', 'props/Tapestry']),
    ('animals', 'Sheep and horses', ['village/Sheep', 'horse/Horse']),
    ('equipment', 'Shields, revolvers and targets', ['props/Shield', 'props/Revolver', 'props/DummyA', 'props/DummyB']),
    ('customization', 'Helms, robber and character looks', ['knight/Knight', 'village/Robber']),
    ('board', 'Board pieces and signs', ['village/Cottage', 'village/Hall', 'village/Road', 'village/Robber']),
    ('cards', 'Resource and development card illustrations', []),
    ('biomes', 'Biome terrain and coast', []),
    ('effects', 'Effects and day/night lighting reference', []),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=Path('E:/Catan_art_obj'))
    parser.add_argument('--engine', type=Path, default=Path('E:/UE_5.8'))
    parser.add_argument('--project', type=Path, default=ROOT / 'apps/unreal')
    args = parser.parse_args()
    files = sorted(args.source.glob('*.png'))
    if len(files) != len(SHEETS):
        raise RuntimeError(f'Expected the 24 inspected sheets; found {len(files)}. Check source mapping first.')
    destination = ROOT / 'assets/concepts/references'
    destination.mkdir(parents=True, exist_ok=True)
    entries = []
    for index, (source, (name, title, models)) in enumerate(zip(files, SHEETS)):
        target = destination / f'{index:02d}-{name}.png'
        shutil.copy2(source, target)
        entries.append({
            'id': name, 'sheet': index, 'title': title,
            'path': target.relative_to(ROOT).as_posix(), 'source_filename': source.name,
            'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'models': models,
            'role': 'concept reference; modelled geometry, not a world billboard',
            'status': 'mapped' if models else 'reference-only',
            'source': {'kind': 'user-provided generated art', 'creator': 'owner-supplied art pack',
                       'authorization': 'Owner requested use for this private game on 2026-11-19'},
        })
    manifest = {
        'schema_version': 1, 'source_directory': str(args.source),
        'art_direction': 'Warm timber, cream plaster, terracotta roofs, bevelled shapes, natural biome colours; metres and human-scale props.',
        'sheets': entries,
        'limitations': 'Static 3D interpretations. Not every drawn variation is built. Existing browser cards reuse their cropped illustrations. Character animation, bespoke Unreal UI and VFX are separate systems.',
    }
    (ROOT / 'assets/concepts/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    # The template provides native movement graphs. Its visual content is deliberately omitted.
    source_bp = args.engine / 'Templates/TP_ThirdPersonBP/Content/ThirdPerson/Blueprints'
    source_input = args.engine / 'Templates/TemplateResources/High/Input/Content'
    target_bp = args.project / 'Content/ThirdPerson/Blueprints'
    target_input = args.project / 'Content/Input'
    target_bp.mkdir(parents=True, exist_ok=True)
    for name in ('BP_ThirdPersonCharacter.uasset', 'BP_ThirdPersonPlayerController.uasset'):
        target = target_bp / name
        if not target.exists():
            shutil.copy2(source_bp / name, target)
    for source in source_input.rglob('*.uasset'):
        target = target_input / source.relative_to(source_input)
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    print(f'Preserved {len(entries)} reference sheets; prepared native walking input in {args.project}.')


if __name__ == '__main__':
    main()
