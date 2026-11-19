"""Exercise the real native PIE actors. Uses only the isolated animation-practice save."""
from pathlib import Path
import json
import time
import unreal

levels=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
editor=unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
if levels.is_in_play_in_editor(): raise RuntimeError('Stop Play before running native animation validation.')
state={'phase':-1,'wall_start':time.monotonic(),'since':0,'checks':[],'frames':{'idle':[],'action':[]}}

def check(name,passed,details=None):
    state['checks'].append({'name':name,'passed':bool(passed),'details':details})
    if not passed: raise AssertionError(name+': '+str(details))

def finish(error=None):
    unreal.unregister_slate_post_tick_callback(state['handle'])
    levels.editor_request_end_play()
    report={'map':editor.get_editor_world().get_name(),'checks':state['checks'],'error':error,
        'scope':'standalone native animation practice; no inventory or online authority'}
    report['passed']=error is None and bool(report['checks']) and all(c['passed'] for c in report['checks'])
    report['frame_ms']={}
    for name,frames in state['frames'].items():
        if frames:
            ordered=sorted(frames)
            report['frame_ms'][name]={'samples':len(frames),'mean':sum(frames)/len(frames),'p95':ordered[int((len(ordered)-1)*.95)]}
    (Path(unreal.Paths.project_saved_dir())/'animation-validation.json').write_text(json.dumps(report,indent=2))
    unreal.log('CATAN NATIVE ANIMATION VALIDATION: '+str(report['passed']))

def tick(delta):
    try:
        if time.monotonic()-state['wall_start']>180: finish('PIE validation timed out'); return
        world=editor.get_game_world()
        if world is None: return
        now=unreal.SystemLibrary.get_game_time_in_seconds(world)
        if state['phase']==-1:
            player=unreal.GameplayStatics.get_player_pawn(world,0)
            if not isinstance(player,unreal.CatanPracticeCharacter): return
            partners=unreal.GameplayStatics.get_all_actors_of_class(world,unreal.CatanPracticeCharacter)
            state.update(player=player,partner=next(p for p in partners if p!=player),
                chest=unreal.GameplayStatics.get_all_actors_of_class(world,unreal.CatanAnimatedChest)[0],phase=0,since=now)
            player.reset_practice()
            return
        player,partner,chest=state['player'],state['partner'],state['chest']
        age=now-state['since']; phase=state['phase']
        if phase in [0,2]: state['frames']['idle' if phase==0 else 'action'].append(unreal.GameplayStatics.get_world_delta_seconds(world)*1000)
        def next_phase(): state.update(phase=phase+1,since=now)
        if phase==0 and age>1:
            check('native character grounded',not player.character_movement.is_falling())
            state['start']=player.get_actor_location()
            check('chest accepts once',chest.open())
            check('chest input spam rejected',not any(chest.open() for _ in range(12)))
            next_phase()
        elif phase==1 and age>2.5:
            check('chest finishes open once',chest.opened and not chest.opening and chest.reveal_requests==1,int(chest.reveal_requests))
            check('open chest cannot restart',not chest.open())
            saved=unreal.GameplayStatics.load_game_from_slot('CatanNight_AnimationPractice_v1',0)
            check('practice reveal persisted',saved is not None)
            chest.set_confirmed_open(True)
            check('state correction does not repeat reveal',chest.reveal_requests==1)
            player.combat.select(unreal.CatanWeapon.SWORD)
            state['hand']=player.mesh.get_socket_transform('HandR',unreal.RelativeTransformSpace.RTS_COMPONENT).translation
            check('sword starts',player.combat.attack())
            check('attack spam rejected',not any(player.combat.attack() for _ in range(12)))
            next_phase()
        elif phase==2 and age>.28:
            check('single authoritative practice contact',player.combat.contact_count==1 and partner.confirmed_practice_hits==1,
                [int(player.combat.contact_count),int(partner.confirmed_practice_hits)])
            check('existing sword damage mirrored only in practice',partner.practice_health==75,int(partner.practice_health))
            hand=player.mesh.get_socket_transform('HandR',unreal.RelativeTransformSpace.RTS_COMPONENT).translation
            check('imported skeletal action moves the hand',(hand-state['hand']).length()>3,(hand-state['hand']).length())
            next_phase()
        elif phase==3 and age>1.3:
            check('partner returns a confirmed attack',player.confirmed_practice_hits==1,int(player.confirmed_practice_hits))
            player.combat.guard(True); partner.combat.attack(); next_phase()
        elif phase==4 and age>.7:
            check('facing sword guard parries',player.practice_parries==1,int(player.practice_parries))
            player.combat.guard(False)
            check('fresh attack allowed after recovery',player.combat.attack())
            player.combat.guard(True); next_phase()
        elif phase==5 and age>.7:
            check('guard cancels pending contact',player.combat.contact_count==1,int(player.combat.contact_count))
            player.combat.guard(False); player.reduced_motion()
            check('reduced motion reaches native components',player.combat.reduced_motion and chest.reduced_motion)
            player.combat.attack(); player.combat.cancel(); next_phase()
        elif phase==6 and age>.7:
            check('canceled action leaves no callback',player.combat.contact_count==1,int(player.combat.contact_count))
            state['walk_start']=player.get_actor_location(); next_phase()
        elif phase==7:
            player.add_movement_input(unreal.Vector(0,1,0),1,True)
            if age>.8:
                distance=(player.get_actor_location()-state['walk_start']).length()
                check('native locomotion responds',distance>150,distance)
                player.strike(); next_phase()
        elif phase==8 and age>.7:
            check('attack while moving recovers',player.combat.contact_count==2,int(player.combat.contact_count))
            player.reset_practice()
            check('practice restart restores health',player.practice_health==100 and partner.practice_health==100)
            check('practice restart closes chest',not chest.opened and chest.reveal_requests==0)
            finish()
    except Exception as error:
        unreal.log_error(str(error)); finish(str(error))

state['handle']=unreal.register_slate_post_tick_callback(tick)
levels.editor_request_begin_play()
