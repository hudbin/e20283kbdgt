import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthenticatedTelegramUser } from '@/lib/auth';

// Tasodifiy 8 xonali taklif kodi generatsiya qilish (masalan: FAM-9A8B)
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'FAM-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 1. GET: Foydalanuvchi a'zo bo'lgan barcha bo'shliqlar va uning a'zolari
export async function GET(req: Request) {
  try {
    const auth = getAuthenticatedTelegramUser(req);
    const { searchParams } = new URL(req.url);
    const telegramId = auth ? auth.telegramId : Number(searchParams.get('telegram_id'));

    if (!telegramId) {
      return NextResponse.json({ error: 'telegram_id is required' }, { status: 400 });
    }

    // Foydalanuvchi qaysi spacelarga a'zo ekanini topamiz
    const { data: memberRows, error: memberErr } = await supabase
      .from('space_members')
      .select('space_id, role, joined_at')
      .eq('telegram_id', telegramId);

    if (memberErr) {
      // Agar migration_v6 hali ishga tushmagan bo'lsa xavfsiz qaytaramiz
      console.warn('Spaces table might not exist yet:', memberErr.message);
      return NextResponse.json({ spaces: [] });
    }

    if (!memberRows || memberRows.length === 0) {
      return NextResponse.json({ spaces: [] });
    }

    const spaceIds = memberRows.map((m) => m.space_id);

    // Bo'shliqlar ma'lumotlarini olamiz
    const { data: spaces, error: spacesErr } = await supabase
      .from('spaces')
      .select('id, name, invite_code, owner_id, created_at')
      .in('id', spaceIds);

    if (spacesErr) {
      return NextResponse.json({ spaces: [] });
    }

    // Bo'shliqlarning barcha a'zolarini va ularning profil ma'lumotlarini olamiz
    const { data: allMembers } = await supabase
      .from('space_members')
      .select('space_id, telegram_id, role, joined_at')
      .in('space_id', spaceIds);

    // Telegram profillarini olish (username, ism)
    const memberTgIds = Array.from(new Set((allMembers || []).map((m) => m.telegram_id)));
    const { data: userProfiles } = await supabase
      .from('users')
      .select('telegram_id, first_name, username')
      .in('telegram_id', memberTgIds);

    const userMap = new Map<number, { first_name: string; username?: string }>();
    (userProfiles || []).forEach((u) => {
      userMap.set(u.telegram_id, { first_name: u.first_name, username: u.username });
    });

    const enrichedSpaces = (spaces || []).map((space) => {
      const myMembership = memberRows.find((m) => m.space_id === space.id);
      const members = (allMembers || [])
        .filter((m) => m.space_id === space.id)
        .map((m) => ({
          telegram_id: m.telegram_id,
          role: m.role,
          joined_at: m.joined_at,
          name: userMap.get(m.telegram_id)?.first_name || `Foydalanuvchi (${m.telegram_id})`,
          username: userMap.get(m.telegram_id)?.username || null,
          is_me: m.telegram_id === telegramId
        }));

      return {
        ...space,
        my_role: myMembership?.role || 'MEMBER',
        members_count: members.length,
        members
      };
    });

    return NextResponse.json({ spaces: enrichedSpaces });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. POST: Yangi oilaviy guruh yaratish YOKI mavjudiga invite code orqali qo'shilish
export async function POST(req: Request) {
  try {
    const auth = getAuthenticatedTelegramUser(req);
    const body = await req.json();
    const telegramId = auth ? auth.telegramId : Number(body.telegram_id);
    const { action, name, invite_code, space_id } = body;

    if (!telegramId) {
      return NextResponse.json({ error: 'telegram_id is required' }, { status: 400 });
    }

    // Action 1: Yangi oilaviy bo'shliq yaratish
    if (action === 'CREATE') {
      if (!name || !name.trim()) {
        return NextResponse.json({ error: 'Guruh nomi kiritilishi shart' }, { status: 400 });
      }

      let code = generateInviteCode();
      // Taklif kodi unikal bo'lishi uchun tekshiramiz
      const { data: existingCode } = await supabase.from('spaces').select('id').eq('invite_code', code).maybeSingle();
      if (existingCode) {
        code = generateInviteCode() + 'X';
      }

      const { data: newSpace, error: createErr } = await supabase
        .from('spaces')
        .insert({
          name: name.trim(),
          invite_code: code,
          owner_id: telegramId
        })
        .select()
        .single();

      if (createErr) {
        return NextResponse.json({ error: createErr.message }, { status: 500 });
      }

      // Egasini a'zo sifatida qo'shish (OWNER)
      await supabase.from('space_members').insert({
        space_id: newSpace.id,
        telegram_id: telegramId,
        role: 'OWNER'
      });

      return NextResponse.json({ success: true, space: newSpace });
    }

    // Action 2: Taklif kodi (Invite code) orqali guruhga qo'shilish
    if (action === 'JOIN') {
      if (!invite_code || !invite_code.trim()) {
        return NextResponse.json({ error: 'Taklif kodi (kod) kiritilishi shart' }, { status: 400 });
      }

      const cleanCode = invite_code.trim().toUpperCase();
      const { data: targetSpace, error: spaceErr } = await supabase
        .from('spaces')
        .select('*')
        .eq('invite_code', cleanCode)
        .maybeSingle();

      if (spaceErr || !targetSpace) {
        return NextResponse.json({ error: 'Bunday kodli guruh topilmadi. Kodni tekshirib qayta urinib ko\'ring.' }, { status: 404 });
      }

      // Foydalanuvchi allaqachon a'zo ekanligini tekshiramiz
      const { data: existingMember } = await supabase
        .from('space_members')
        .select('id')
        .eq('space_id', targetSpace.id)
        .eq('telegram_id', telegramId)
        .maybeSingle();

      if (existingMember) {
        return NextResponse.json({ error: 'Siz allaqachon ushbu guruhga a\'zosiz' }, { status: 400 });
      }

      // A'zo qilib qo'shamiz
      const { error: joinErr } = await supabase.from('space_members').insert({
        space_id: targetSpace.id,
        telegram_id: telegramId,
        role: 'MEMBER'
      });

      if (joinErr) {
        return NextResponse.json({ error: joinErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, space: targetSpace });
    }

    // Action 3: Guruhdan chiqish (LEAVE)
    if (action === 'LEAVE') {
      if (!space_id) {
        return NextResponse.json({ error: 'space_id kerak' }, { status: 400 });
      }

      const { error: delErr } = await supabase
        .from('space_members')
        .delete()
        .eq('space_id', space_id)
        .eq('telegram_id', telegramId);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Guruh tark etildi' });
    }

    return NextResponse.json({ error: 'Noma\'lum amal (action)' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
