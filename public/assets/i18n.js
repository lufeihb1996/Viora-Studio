(() => {
  'use strict';
  const dictionary = {
    'Viora Studio | AI Image Creation': 'Viora Studio｜AI 图像创作',
    'AI Studio': 'AI 创作室', 'Aesthetics': '视觉风格', 'Gallery': '作品展示', 'FAQ': '常见问题',
    'Try Viora Studio': '进入创作室', 'New': '全新',
    'Viora Studio is live · Open the workspace →': 'Viora Studio 已上线 · 进入创作室 →',
    'a creative space for ideas and images': '把灵感变成图像的创作空间',
    'Your ideas, brought to life.': '让你的灵感跃然眼前。',
    'Style reference': '风格示例', 'Choose random': '随机示例', 'Try in Workspace': '在创作室中使用',
    'Scroll to learn more': '向下滚动了解更多', 'Viora Studio is here.': 'Viora Studio 全新上线。',
    'Our production workspace for high-speed AI image generation.': '在创作室中快速生成 AI 图像。',
    'Expressive aesthetics, optical realism, and fine texture detail. Create and explore your ideas in one workspace.': '探索丰富的视觉风格与细腻画面，在同一个空间中创作你的灵感。',
    'Try Viora Studio Workspace': '进入 Viora Studio 创作室', 'Any style you': '任何风格，', 'can imagine': '由你想象',
    'Explore visual styles and create images from your own ideas.': '探索视觉风格，用你的灵感创作图像。',
    'Prompt': '提示词', 'Copy Prompt': '复制提示词', 'Copied ✓': '已复制 ✓',
    'Foundation Model': '创作工具', 'Guidance & Steps': '生成设置', 'High resolution': '高分辨率',
    'Try out this style': '试试这个风格', 'Every output': '每一次创作，', 'will surprise you': '都值得期待',
    'Great art pushes boundaries. Simple prompts yield a wide range of high-quality images with authentic optical physics—not just the same airbrushed concept repeated four times.': '用简单的提示词探索多样的画面，让每一个创意都有更多可能。',
    'Start building with Viora Studio.': '从 Viora Studio 开始创作。',
    'Open the workspace and start creating.': '打开创作室，开始创作。', 'Open Viora Workspace': '打开创作室',
    'Read Technical FAQ': '查看常见问题', 'Questions people ask about Viora Studio': '关于 Viora Studio 的常见问题',
    'Viora Studio powers creatives, studios, and everyday people': '为创作者、工作室和每一个有灵感的人而打造',
    'Start generating now.': '现在开始创作。', 'AI image generation & style control foundation platform.': 'AI 图像生成与视觉创作平台。',
    'Support:': '联系支持：', 'Create': '创作', 'Viora Studio Generator': 'Viora Studio 图像生成',
    'Style Control': '风格创作', 'Specifications': '功能', 'Creative image generation': '创意图像生成',
    'About': '关于', 'Legal & Compliance': '法律与合规', 'Terms of Service': '服务条款', 'Privacy Policy': '隐私政策',
    'Contact & Business Info': '联系与商户信息', '© 2026 Viora Studio. All rights reserved.': '© 2026 Viora Studio. 保留所有权利。',
    'Creative image workspace': '创意图像工作室', 'Modal Title': '详情', 'Close': '关闭',
    'Sign in to Viora Studio': '登录 Viora Studio', 'Your images and history are saved privately to your account.': '你的图片和历史记录将私密保存到你的账户。',
    'Username': '用户名', 'Password': '密码',
    'Username: 3–24 letters, numbers, or underscores. Password: at least 8 characters.': '用户名为 3–24 位英文字母、数字或下划线；密码至少 8 位。',
    'Sign in': '登录', 'Create account': '注册', 'Home': '首页', 'Create images': '图像创作', 'Engine': '创作工具',
    'Queue: Idle': '队列：空闲', 'Queue: Idle (0 waiting)': '队列：空闲（无等待任务）', 'Sign out': '退出登录',
    'Model': '创作工具', 'Server status': '服务状态', 'Server online': '服务在线', 'Server offline': '服务离线',
    'Create images with Viora Studio': '用 Viora Studio 创作图像',
    'Describe your idea below or choose a prompt to start creating.': '在下方描述你的创意，或选择一个示例开始创作。',
    'iPhone 16 Pro Candid': 'iPhone 16 Pro 随拍', 'Leica M6 35mm Documentary': '徕卡 M6 35mm 纪实',
    'Raw unedited 24mm f/5.6 deep focus smartphone photography with physiological skin texture.': '24mm、f/5.6 大景深手机摄影，呈现自然真实的皮肤质感。',
    '50mm f/1.8 optical depth with organic Kodak Portra film grain and zero plastic retouching.': '50mm、f/1.8 景深，搭配自然的柯达 Portra 胶片颗粒与真实质感。',
    'Creating your image...': '正在创作图像……', '+ iPhone 16 Pro Candid': '+ iPhone 16 Pro 随拍',
    '+ Leica M6 35mm Film': '+ 徕卡 M6 35mm 胶片', '+ 16:9 Cinema Frame': '+ 16:9 电影画幅',
    'Steps': '步数', 'Guidance': '引导强度', 'Seed': '种子', 'Generate': '开始生成', 'Creating...': '正在生成……',
    'Image created': '图像已生成', 'Remix': '再次创作',
    'Saving image...': '正在保存图像……',
    'Creating image...': '正在创作图像……', 'Waiting in queue...': '正在排队……',
    'Saving or connection failed. Retrying...': '保存或连接失败，正在重试……',
    'Please wait...': '请稍候……', 'Enter your password.': '请输入密码。',
    'Username: 3–24 letters, numbers, or underscores.': '用户名需为 3–24 位英文字母、数字或下划线。',
    'Password must be 8–72 characters.': '密码需为 8–72 个字符。',
    'Username must be 3–24 letters, numbers or underscores.': '用户名需为 3–24 位英文字母、数字或下划线。',
    'Username is already in use.': '该用户名已被使用。', 'Registration limit reached. Please try again later.': '注册次数已达上限，请稍后再试。',
    'Registration is unavailable.': '暂时无法注册，请稍后再试。', 'Unable to create account. Please try again.': '无法创建账户，请稍后再试。',
    'Could not create account. Please try again.': '无法创建账户，请稍后再试。', 'Incorrect username or password.': '用户名或密码不正确。',
    'Account created. Please sign in with your username and password.': '账户已创建，请使用用户名和密码登录。',
    'Account created. Please sign in.': '账户已创建，请登录。', 'Could not connect. Please try again.': '无法连接，请稍后再试。',
    'Wait for active images to finish saving before signing out.': '请等待图像保存完成后再退出登录。',
    'Unable to sign out. Please try again.': '无法退出登录，请重试。',
    'Cloud history unavailable. Please try again.': '无法读取云端历史，请重试。',
    'Invalid application key.': '应用配置无效，请联系管理员。',
    'Request too large': '请求内容过大。',
    'The server is busy. Please wait until it is available.': '服务器正忙，请等待空闲后再提交。',
    'Generation failed. Please try again.': '生成失败，请重试。', 'Generation could not be started. Please try again.': '无法开始生成，请重试。',
    'Unable to delete image. Please try again.': '无法删除图片，请重试。',
    'What is Viora Studio?': '什么是 Viora Studio？',
    'Viora Studio is an AI image workspace for exploring ideas and saving your creations.': 'Viora Studio 是一个用于探索灵感和保存作品的 AI 图像创作空间。',
    'How is Viora Studio different from other AI image generators?': 'Viora Studio 可以如何使用？',
    'Describe what you want to create, choose an aspect ratio, and explore different results.': '描述你想创作的画面，选择画幅比例，探索不同的结果。',
    'What can creative teams use Viora Studio for?': '创作团队可以用 Viora Studio 做什么？',
    'Creative teams can use Viora Studio for campaign concepts, product imagery, storyboards, brand exploration, editorial art direction, game concepts, and fast visual iteration.': '可以用于活动创意、产品图像、故事板、品牌探索、视觉设计、游戏概念和创意迭代。',
    'Can I upload reference images?': '可以上传参考图吗？', 'The current workspace supports text prompts. Reference-image features are not yet available.': '目前支持文字提示词，参考图功能尚未开放。',
    'Is payment available?': '现在可以付费吗？', 'Payment and subscription features are not available yet.': '支付与订阅功能暂未开放。',
    'Contemporary Dancer': '现代舞者', 'Graphic Illustration': '平面插画', 'Risograph Runners': '孔版印刷跑者',
    'Armored Samurai': '铠甲武士', 'Cinematic Concept': '电影概念', 'Elven Tiger Rider': '精灵虎骑士',
    'Expressive Design': '表现性设计', 'Desert Cowboy': '沙漠牛仔', '35mm Film Look': '35mm 胶片风格',
    'Bengal Tiger Study': '孟加拉虎', 'Fine Detail': '精细质感',
    '1. Overview:': '1. 概述：', 'Viora Studio provides AI image generation software.': 'Viora Studio 提供 AI 图像生成软件。',
    '2. Commercial License:': '2. 商业使用：', 'Usage rights depend on applicable model terms and law.': '使用权利取决于适用的模型条款和法律。',
    '1. Data Collection:': '1. 数据收集：', 'Your account details, prompts, and generated images are stored to provide the service.': '我们会保存账户信息、提示词和生成的图片，以提供服务。',
    '2. Payment Security:': '2. 支付：', 'Payment features are not currently available.': '支付功能目前尚未开放。',
    'Contact & Merchant Information': '联系与商户信息', 'Studio Name:': '工作室名称：', 'Support Email:': '支持邮箱：',
    'a male contemporary dancer focused on dancing, Contrapposto pose, body contorted, wide angle, one hand outstretched mid-dance towards the camera, his face turned away from the camera, high contrast': '一位专注起舞的男性现代舞者，以对立平衡姿态扭转身体，广角镜头，一只手在舞动中伸向镜头，脸转向一侧，高对比度。',
    'People running. extremely exaggerated wide camera angle, exaggerated shapes. risograph poster. graphic illustration. dynamic composition.': '奔跑的人群，极度夸张的广角镜头与造型，孔版印刷海报、平面插画、动态构图。',
    'Cinematic wide-angle shot of an ornate samurai warrior in dramatic chiaroscuro lighting, rich metallic textures, atmospheric mist.': '电影感广角画面，一位华丽的武士置于戏剧性的明暗光影中，金属质感丰富，薄雾弥漫。',
    'Fantasy concept art of a dark blue skinned elven archer riding a white tiger, solid green backdrop, flat graphic design, distorted proportions and highly dynamic expressive composition': '奇幻概念艺术：深蓝皮肤的精灵弓箭手骑着白虎，纯绿色背景，平面设计，夸张比例和充满动感的构图。',
    'Male cowboy riding horse through the desert, close up shot, golden hour dust particles, authentic 35mm film grain.': '男性牛仔骑马穿越沙漠，特写镜头，金色时刻的尘埃与真实的 35mm 胶片颗粒。',
    'Close-up expressive wildlife study of a tiger in motion, fine fur texture, dramatic rim lighting and deep contrast.': '动态老虎的表现性野生动物特写，细腻毛发、戏剧性轮廓光与深邃对比。'
  };
  const attributes = { 'Previous style':'上一种风格', 'Next style':'下一种风格', 'Style preview':'风格预览',
    'Portrait Realism':'写实人像', 'Optical Still Life':'静物作品', 'Editorial Fashion':'时尚作品', 'Architectural Interior':'建筑室内',
    'Start building':'开始创作', 'Footer visual':'页脚图片', 'Full resolution preview':'原图预览',
    'Toggle Sidebar':'切换侧边栏', 'Refresh Feed':'刷新作品', 'Random Seed':'随机种子', 'Shortcut: Ctrl + Enter':'快捷键：Ctrl + Enter',
    'Describe the image you want to create... (Ctrl + Enter to generate)':'描述你想创作的画面……（Ctrl + Enter 生成）',
    'Reuse Prompt':'复用提示词', 'Download PNG':'下载 PNG', 'Delete':'删除', 'Generated Output':'生成的图像',
    'Username':'用户名', 'Password':'密码' };
  const reverse = Object.fromEntries(Object.entries(dictionary).map(([en, zh]) => [zh, en]));
  const attrReverse = Object.fromEntries(Object.entries(attributes).map(([en, zh]) => [zh, en]));
  let language = 'zh';
  try { language = localStorage.getItem('viora_language') === 'en' ? 'en' : 'zh'; } catch (_) {}
  const skipped = node => !!(node.parentElement && node.parentElement.closest('script, style, textarea, [data-i18n-skip]'));
  function translate(value, table, back) {
    const trimmed = value.trim();
    let replacement = language === 'zh' ? table[trimmed] : back[trimmed];
    if (!replacement && table === dictionary) {
      let match;
      if (language === 'zh' && (match = trimmed.match(/^Ahead: (\d+|\?) task\(s\)$/))) replacement = `前方 ${match[1]} 个任务`;
      if (language === 'en' && (match = trimmed.match(/^前方 (\d+|\?) 个任务$/))) replacement = `Ahead: ${match[1]} task(s)`;
      if (language === 'zh' && (match = trimmed.match(/^Waiting in queue \(#(\d+)\)\.\.\.$/))) replacement = `正在排队（第 ${match[1]} 位）……`;
      if (language === 'en' && (match = trimmed.match(/^正在排队（第 (\d+) 位）……$/))) replacement = `Waiting in queue (#${match[1]})...`;
      if (language === 'zh' && (match = trimmed.match(/^Creating \((\d+)%\)(?: · \+(\d+) queued)?$/))) replacement = `正在生成（${match[1]}%）${match[2] ? ` · 等待 ${match[2]} 项` : ''}`;
      if (language === 'en' && (match = trimmed.match(/^正在生成（(\d+)%）(?: · 等待 (\d+) 项)?$/))) replacement = `Creating (${match[1]}%)${match[2] ? ` · +${match[2]} queued` : ''}`;
      if (language === 'zh' && (match = trimmed.match(/^Seed (\d+)$/))) replacement = `种子 ${match[1]}`;
      if (language === 'en' && (match = trimmed.match(/^种子 (\d+)$/))) replacement = `Seed ${match[1]}`;
      if (language === 'zh' && (match = trimmed.match(/^Prompt: horse rearing #(\d+)$/))) replacement = `提示词：跃起的马 #${match[1]}`;
      if (language === 'en' && (match = trimmed.match(/^提示词：跃起的马 #(\d+)$/))) replacement = `Prompt: horse rearing #${match[1]}`;
    }
    return replacement ? value.replace(trimmed, replacement) : value;
  }
  function apply(root = document) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (!skipped(root)) { const next = translate(root.nodeValue, dictionary, reverse); if (next !== root.nodeValue) root.nodeValue = next; }
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE && root.closest('script, style, textarea, [data-i18n-skip]')) return;
    const elements = root.nodeType === Node.ELEMENT_NODE ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
    for (const el of elements) {
      if (el.closest('script, style, textarea, [data-i18n-skip]')) continue;
      for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) {
        if (!el.hasAttribute(attr)) continue;
        const old = el.getAttribute(attr), next = translate(old, attributes, attrReverse);
        if (old !== next) el.setAttribute(attr, next);
      }
      for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE) apply(node);
    }
  }
  function setLanguage(next) {
    language = next === 'en' ? 'en' : 'zh';
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    try { localStorage.setItem('viora_language', language); } catch (_) {}
    apply();
    document.dispatchEvent(new CustomEvent('viora-language-change', { detail: language }));
  }
  window.VioraI18n = { toggle: () => setLanguage(language === 'zh' ? 'en' : 'zh'), setLanguage,
    text: value => translate(value, dictionary, reverse), get language() { return language; } };
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') apply(record.target);
        else if (record.type === 'attributes') apply(record.target);
        else for (const node of record.addedNodes) apply(node);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label', 'alt'] });
  });
})();
