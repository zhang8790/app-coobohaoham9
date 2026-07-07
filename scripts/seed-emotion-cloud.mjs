// 直接通过 Supabase REST (anon key, RLS 已关) 把情绪系统种子数据写入云端
// 用法: node scripts/seed-emotion-cloud.mjs
const URL = "https://pyqgsxcjmijtbstwthbn.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM";

const headers = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Prefer": "resolution=merge-duplicates", // 幂等 upsert
};

const categories = [
  {
    category_key: "餐饮", label: "餐饮美食", tone: "烟火人间，与人共食的妥帖",
    allowed_mood_tags: ["治愈","满足","幸福","温馨","甜蜜","愉悦","分享","用餐时光","放松","仪式感","怀旧","温暖"],
    metaphors: ["灶上咕嘟的汤","一桌人对坐的灯","街角老馆子的香","碗中升腾的热气"],
    angles: ["与人共食，滋味更浓。","一蔬一饭，最抚凡人心。","围坐的此刻，便是归处。"],
    closers: ["趁热，慢慢吃。","这一餐，值得好好坐下来。"],
    aliases: ["正餐","小吃","快餐","火锅","烧烤","夜宵","外卖","饭","餐","美食","餐厅"],
  },
  {
    category_key: "饮品", label: "饮品", tone: "微醺与小憩，唇齿间的喘息",
    allowed_mood_tags: ["甜蜜","治愈","放松","愉悦","清新","清爽","浪漫","慢生活"],
    metaphors: ["杯壁凝着的水珠","午后的一口清凉","巷口捧着的那杯暖","吸管搅动的甜"],
    angles: ["小口啜饮，日子慢下来。","给自己一段喘息。"],
    closers: ["慢慢喝，不着急。"],
    aliases: ["奶茶","咖啡","果茶","酒水","茶","饮料","汽水","果汁"],
  },
  {
    category_key: "烘焙", label: "烘焙甜点", tone: "晨间手作的温度",
    allowed_mood_tags: ["甜蜜","治愈","温馨","幸福","满足","浪漫"],
    metaphors: ["刚出炉的暖香","窗台边那块松软","晨光里的酥皮","指尖沾着的糖粉"],
    angles: ["一口下去，整个人都松了。","甜的东西，最懂安慰。"],
    closers: ["趁新鲜，尝一口。"],
    aliases: ["面包","甜点","蛋糕","西点","糕点","甜品"],
  },
  {
    category_key: "水果生鲜", label: "水果生鲜", tone: "土地与时令的鲜活",
    allowed_mood_tags: ["清爽","清新","自然","纯净","解暑","治愈","活力","满足"],
    metaphors: ["枝头带露的鲜","山野吹来的风","刚从土里醒来的清气","井水镇过的脆"],
    angles: ["从田间到舌尖，不过片刻。","应季的鲜，最懂身体。"],
    closers: ["鲜的，不必多说。"],
    aliases: ["果蔬","水果","生鲜","蔬菜","肉禽","海鲜","农产","食材","农场"],
  },
  {
    category_key: "零售", label: "零售百货", tone: "悦己的小确幸与陪伴",
    allowed_mood_tags: ["快乐","满足","惊喜","治愈","温馨","可爱","有趣","浪漫","甜蜜","怀旧"],
    metaphors: ["抽屉里的小欢喜","案头的一件趣物","旧书页的香","随手摆着的可爱"],
    angles: ["给自己一点甜。","寻常日子里的小光。"],
    closers: ["喜欢，就带它回家。"],
    aliases: ["零食","百货","图书","日用","杂货","文创","超市","便利店"],
  },
  {
    category_key: "美业", label: "丽人美业", tone: "悦己与焕新的精致",
    allowed_mood_tags: ["精致","治愈","放松","浪漫","甜蜜","仪式感","高端","典雅"],
    metaphors: ["镜中焕然的自己","指尖温柔的时光","被妥帖照料的容颜","发梢掠过的轻"],
    angles: ["为自己停下来的那一刻。","好好爱自己，不亏。"],
    closers: ["你值得被温柔对待。"],
    aliases: ["美甲","美容","美发","护肤","SPA","丽人","造型","美睫","纹绣"],
  },
  {
    category_key: "娱乐", label: "休闲娱乐", tone: "释放与社交的沉浸",
    allowed_mood_tags: ["快乐","兴奋","刺激","活力","愉悦","分享","有趣"],
    metaphors: ["灯影里炸开的笑","一群人的喧闹","卸下伪装的夜","屏幕亮起的雀跃"],
    angles: ["痛快闹一场。","和朋友，才够味。"],
    closers: ["今晚，尽兴就好。"],
    aliases: ["KTV","剧本杀","影院","密室","电玩","桌游","酒吧","夜店","游乐","演出"],
  },
  {
    category_key: "运动健身", label: "运动健身", tone: "活力与自律的突破",
    allowed_mood_tags: ["活力","满足","专注","兴奋","放松","自然"],
    metaphors: ["汗水落地的脆","突破极限的喘息","身体苏醒的晨","肌肉舒展的暖"],
    angles: ["动起来，通体舒畅。","坚持，身体会记得。"],
    closers: ["练完这一组，整个人都轻了。"],
    aliases: ["瑜伽","游泳","私教","健身","拳击","骑行","跑步","舞蹈"],
  },
  {
    category_key: "亲子", label: "亲子", tone: "陪伴与成长的童真",
    allowed_mood_tags: ["温馨","幸福","甜蜜","治愈","快乐","可爱"],
    metaphors: ["孩子扬起的笑","牵着的小手","时光里的童真","蹦跳着的身影"],
    angles: ["陪他长大，也是陪自己重温童年。","孩子的笑，最能化开疲惫。"],
    closers: ["这样的时光，最珍贵。"],
    aliases: ["乐园","早教","摄影","婴童","儿童","母婴","托管"],
  },
  {
    category_key: "生活服务", label: "生活服务", tone: "省心与托付的安心",
    allowed_mood_tags: ["放松","治愈","实用","温馨","安心"],
    metaphors: ["交出去的轻松","被妥帖打理的琐碎","归家时的整洁","不必自己动手的闲"],
    angles: ["麻烦的事，交给专业的人。","把时间留给自己。"],
    closers: ["剩下的，安心就好。"],
    aliases: ["家政","维修","洗衣","洗车","保洁","托管","养护","上门"],
  },
  {
    category_key: "酒店民宿", label: "酒店民宿", tone: "栖居与远方的慢生活",
    allowed_mood_tags: ["放松","治愈","慢生活","浪漫","平静","安逸","温馨"],
    metaphors: ["推开窗的山景","一夜好眠的软","异乡的灯","院里那棵老树"],
    angles: ["在路上，也是在家。","换一处地方，换一种心绪。"],
    closers: ["好好歇一晚。"],
    aliases: ["酒店","民宿","客栈","住宿","青旅"],
  },
  {
    category_key: "通用", label: "通用", tone: "安宁",
    allowed_mood_tags: [],
    metaphors: [],
    angles: [""],
    closers: [],
    aliases: [],
  },
];

const taxonomy = [
  ["快乐","expressive_high","明亮愉悦，适合分享庆祝"],
  ["兴奋","expressive_high","高能量，值得记录"],
  ["满足","expressive_high","被填满的踏实"],
  ["惊喜","expressive_high","意外的小确幸"],
  ["幸福","expressive_high","圆满感"],
  ["浪漫","expressive_high","心动与仪式"],
  ["甜蜜","expressive_high","温柔的甜"],
  ["有趣","expressive_high","好玩、想分享"],
  ["可爱","expressive_high","被萌到的开心"],
  ["活力","expressive_high","元气满满"],
  ["潮流","eager_forward","想跟上、想尝试"],
  ["个性","eager_forward","想表达自我"],
  ["奢华","expressive_high","犒赏自己的高光"],
  ["高端","expressive_high","值得郑重对待"],
  ["尊贵","expressive_high","被重视的体面"],
  ["典雅","expressive_high","含蓄的高级感"],
  ["平静","peaceful_zen","需要安放的心"],
  ["放松","peaceful_zen","卸下紧绷"],
  ["舒适","peaceful_zen","被托住的安稳"],
  ["安逸","peaceful_zen","不必赶路的闲"],
  ["慢生活","peaceful_zen","把节奏放慢"],
  ["治愈","peaceful_zen","被轻轻抚平"],
  ["自然","peaceful_zen","回到本真的静"],
  ["纯净","peaceful_zen","清空杂念"],
  ["清新","peaceful_zen","透气的清爽"],
  ["清爽","peaceful_zen","褪去燥热"],
  ["解暑","peaceful_zen","一时的清凉慰藉"],
  ["温馨","nostalgic_soft","像家的暖意"],
  ["感动","nostalgic_soft","被触到的柔软"],
  ["怀旧","nostalgic_soft","旧时光的回响"],
  ["温暖","nostalgic_soft","被围住的暖"],
  ["精致","eager_forward","想对自己更好一点"],
  ["唯美","eager_forward","向往美感生活"],
].map(([mood_tag, inner_label, description]) => ({ mood_tag, inner_label, description }));

async function post(path, rows) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });
  const text = await res.text();
  if (!res.ok && res.status !== 409) {
    throw new Error(`${path} -> ${res.status} ${text}`);
  }
  return `${path}: ${res.status} (${rows.length} rows)`;
}

(async () => {
  try {
    console.log(await post("category_emotion_profiles", categories));
    console.log(await post("emotion_taxonomy", taxonomy));
    console.log("✅ 种子数据写入完成");
  } catch (e) {
    console.error("❌", e.message);
    process.exit(1);
  }
})();
