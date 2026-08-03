-- ============================================================
-- 战略支柱②延伸：门店端「授权式」食养档案同步
-- ------------------------------------------------------------
-- 目标：打通「线上食养工具引流 → 线下门店精准导购承接」闭环的最后一环。
--       让中转仓 / 加盟店员在用户到店时，能看到该用户（已显式授权）的
--       中性食养画像，做「不宜 / 慎选配料 + 本店适配清单」的精准导购，
--       而非空口推荐——这是本项目最大的护城河缺口。
--
-- 设计：SECURITY DEFINER RPC，三重合规闸门（缺一不可）：
--   ① 调用者须是本店 owner 或 active staff（防止跨店窥探）
--   ② 目标用户须是本店会员（user_store_relation，防止非会员被查）
--   ③ 会员须显式授权（user_health_profile.privacy_flags->'share_food_profile_to_store' = true）
--
-- 返回：仅中性「膳食参考」维度（体质 / 年龄 / 过敏原 / 慢病 / 体感 / 目标）
--       + 家庭成员中性画像；绝不含病历 / 诊断等医疗字段。
--       所有字段定位为「膳食参考工具」输出，不替代医嘱（合规红线）。
--
-- 合规：体质档案属健康 PII，严禁裸奔暴露；本函数即「授权开关」的落地闸门。
-- 依赖：00205(user_health_profile) / 00015(store_staff, user_store_relation)
--       / 00001(stores.owner_id) / 20260802_family_archive(family_members)
-- ============================================================

create or replace function public.get_store_member_food_profile(
  p_store_id        uuid,
  p_member_user_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller          uuid := auth.uid();
  v_is_store_staff  boolean := false;
  v_is_member       boolean := false;
  v_authorized      boolean := false;
  v_profile         public.user_health_profile%rowtype;
begin
  -- 入参校验：匿名 / 缺参直接拒绝
  if v_caller is null or p_store_id is null or p_member_user_id is null then
    return jsonb_build_object('authorized', false, 'reason', 'missing_params');
  end if;

  -- 闸门①：调用者须是本店 owner 或 active staff
  select true into v_is_store_staff
  from public.stores s
  where s.id = p_store_id
    and (s.owner_id = v_caller
      or exists (
        select 1 from public.store_staff ss
        where ss.store_id = p_store_id
          and ss.user_id = v_caller
          and ss.is_active
      ));
  if not v_is_store_staff then
    return jsonb_build_object('authorized', false, 'reason', 'not_store_staff');
  end if;

  -- 闸门②：目标须是本店会员（锁客关系）
  select true into v_is_member
  from public.user_store_relation r
  where r.store_id = p_store_id
    and r.user_id = p_member_user_id;
  if not v_is_member then
    return jsonb_build_object('authorized', false, 'reason', 'not_store_member');
  end if;

  -- 闸门③：会员须显式授权「向常去门店分享食养档案」
  select true into v_authorized
  from public.user_health_profile p
  where p.user_id = p_member_user_id
    and coalesce(p.privacy_flags->>'share_food_profile_to_store', 'false') = 'true';
  if not v_authorized then
    return jsonb_build_object('authorized', false, 'reason', 'not_authorized');
  end if;

  -- 取会员中性食养画像（本人）
  select * into v_profile
  from public.user_health_profile p
  where p.user_id = p_member_user_id;

  -- 返回授权后的中性维度 + 家庭成员中性画像
  return jsonb_build_object(
    'authorized', true,
    'reason', 'ok',
    'member', jsonb_build_object(
      'age_group',          v_profile.age_group,
      'gender',             v_profile.gender,
      'constitution_type',  v_profile.constitution_type,
      'allergies',          to_jsonb(coalesce(v_profile.allergies, '{}')),
      'chronic_conditions', to_jsonb(coalesce(v_profile.chronic_conditions, '{}')),
      'body_states',        to_jsonb(coalesce(v_profile.body_states, '{}')),
      'health_goals',       to_jsonb(coalesce(v_profile.health_goals, '{}'))
    ),
    'family', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'name',              fm.name,
          'age_group',         fm.age_group,
          'constitution_type', fm.constitution_type,
          'allergies',         to_jsonb(coalesce(fm.allergies, '{}')),
          'chronic_conditions', to_jsonb(coalesce(fm.chronic_conditions, '{}')),
          'body_states',       to_jsonb(coalesce(fm.body_states, '{}')),
          'health_goals',      to_jsonb(coalesce(fm.health_goals, '{}'))
        ))
        from public.family_members fm
        where fm.owner_id = p_member_user_id
      ),
      '[]'::jsonb
    )
  );

exception when others then
  raise warning '[get_store_member_food_profile] store=%, member=%, err=%',
    p_store_id, p_member_user_id, sqlerrm;
  return jsonb_build_object('authorized', false, 'reason', 'error');
end;
$$;

grant execute on function public.get_store_member_food_profile(uuid, uuid) to authenticated;

comment on function public.get_store_member_food_profile(uuid, uuid) is
  '门店端授权式食养档案同步：三重合规闸门（店员归属 / 本店会员 / 会员显式授权），仅返回中性食养参考维度，不含医疗字段';
