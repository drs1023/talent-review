const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export const dimensions = [
  { id: 'player', name: '玩家洞察', description: '理解玩家行为与体验，能将反馈转化为设计判断' },
  { id: 'craft', name: '专业设计', description: '在系统、数值、玩法、内容或活动方向形成可靠方案' },
  { id: 'complexity', name: '复杂问题', description: '定义模糊问题，权衡体验、成本与长期影响' },
  { id: 'delivery', name: '交付迭代', description: '推动方案实现、验证与版本复盘' },
  { id: 'collaboration', name: '跨职能协同', description: '与程序、美术、测试、运营建立有效协作' },
  { id: 'exploration', name: '0→1探索', description: '提出假设、制作原型并从试错中学习' }
];

export const roleProfiles = {
  '系统/数值': { player: 15, craft: 25, complexity: 20, delivery: 15, collaboration: 15, exploration: 10 },
  '玩法/战斗': { player: 20, craft: 25, complexity: 15, delivery: 15, collaboration: 10, exploration: 15 },
  '内容/叙事': { player: 20, craft: 25, complexity: 10, delivery: 20, collaboration: 15, exploration: 10 },
  '活动/运营': { player: 25, craft: 15, complexity: 15, delivery: 20, collaboration: 15, exploration: 10 }
};

const people = [
  ['P01','林澈','系统/数值','长线运营组','苍穹纪元','成熟运营','可流动','核心系统负责人',4,4,4,4,3,3],
  ['P02','沈若宁','玩法/战斗','玩法研发组','苍穹纪元','成熟运营','愿意探索','战斗玩法主策',4,4,4,3,4,4],
  ['P03','周予安','系统/数值','长线运营组','苍穹纪元','成熟运营','暂不流动','经济系统骨干',3,4,4,4,3,2],
  ['P04','顾远','内容/叙事','内容组','苍穹纪元','成熟运营','愿意探索','世界观策划',4,4,3,3,4,4],
  ['P05','程以宁','活动/运营','版本运营组','苍穹纪元','成熟运营','可流动','活动策划',4,3,3,4,4,3],
  ['P06','叶知行','玩法/战斗','玩法研发组','苍穹纪元','成熟运营','愿意探索','关卡策划',3,3,4,3,3,4],
  ['P07','宋嘉禾','系统/数值','长线运营组','苍穹纪元','成熟运营','需沟通','成长系统策划',3,3,3,4,4,3],
  ['P08','许一帆','内容/叙事','内容组','苍穹纪元','成熟运营','可流动','叙事策划',4,3,3,4,3,3],
  ['P09','陆星河','玩法/战斗','玩法研发组','苍穹纪元','成熟运营','需沟通','玩法策划',3,3,3,3,4,4],
  ['P10','韩书言','活动/运营','版本运营组','苍穹纪元','成熟运营','暂不流动','版本活动骨干',4,3,4,4,3,2],
  ['P11','杜明川','系统/数值','长线运营组','苍穹纪元','成熟运营','愿意探索','数值策划',3,4,3,3,3,4],
  ['P12','唐月','内容/叙事','内容组','苍穹纪元','成熟运营','需沟通','内容策划',3,3,3,3,4,3]
].map(([id,name,role,team,project,stage,mobility,title,player,craft,complexity,delivery,collaboration,exploration]) => ({id,name,role,team,project,stage,mobility,title,scores:{player,craft,complexity,delivery,collaboration,exploration}}));

const evidence = [
  ['E01','P01','版本经济系统平衡方案','版本上线','经济系统调整后持续观察玩家交易与资源消耗，提出两轮迭代方案。','专业设计',24,'主管确认','项目复盘'],
  ['E02','P01','跨模块方案评审','方案评审','协调数值、程序与运营明确方案边界，保留长期观测指标。','复杂问题',12,'待确认','方案文档'],
  ['E03','P02','新玩法原型测试','原型测试','主导早期原型，依据玩家测试反馈调整核心循环。','0→1探索',9,'主管确认','原型复盘'],
  ['E04','P02','战斗体验优化','版本上线','推动战斗手感调整，与程序、美术共同完成验收。','跨职能协同',35,'协作方验证','版本复盘'],
  ['E05','P03','经济系统异常处理','线上问题','定位资源产出异常，与数据团队共同制定修复方案。','复杂问题',17,'主管确认','问题复盘'],
  ['E06','P03','长期数值框架设计','方案评审','沉淀多版本数值框架，降低后续版本调整成本。','专业设计',220,'主管确认','历史方案'],
  ['E07','P04','新世界观方向提案','方案评审','提出新项目世界观框架，完成跨团队概念讨论。','0→1探索',42,'待确认','概念方案'],
  ['E08','P05','节日活动复盘','版本复盘','结合玩家分层反馈，调整活动任务节奏。','玩家洞察',6,'主管确认','活动复盘'],
  ['E09','P06','副本机制原型','原型测试','独立完成副本机制白盒原型，并记录测试假设。','0→1探索',14,'待确认','原型记录'],
  ['E10','P07','新人带教与交付','带教完成','将成长系统文档整理为可复用的新人学习材料。','跨职能协同',57,'协作方验证','带教反馈'],
  ['E11','P08','主线内容上线','版本上线','负责主线内容交付，并依据体验反馈做调整。','交付迭代',125,'主管确认','版本复盘'],
  ['E12','P09','玩法设想评审','方案评审','提出新的社交玩法设想，目前尚未经过原型验证。','0→1探索',88,'待确认','方案文档'],
  ['E13','P10','版本活动节奏管理','版本上线','跨三个版本稳定交付活动内容。','交付迭代',27,'主管确认','版本复盘'],
  ['E14','P11','新项目数值沙盘','原型测试','建立成长数值沙盘并记录关键假设与敏感性。','0→1探索',8,'主管确认','原型复盘'],
  ['E15','P12','玩家文本反馈归纳','玩家反馈','归纳剧情任务中的玩家反馈，形成两个优化方向。','玩家洞察',31,'待确认','玩家反馈']
].map(([id,personId,title,eventType,summary,dimension,days,status,source]) => ({id,personId,title,eventType,summary,dimension,date:day(days),status,source}));

export function createDemoState() {
  return {
    people: structuredClone(people),
    evidence: structuredClone(evidence),
    actions: [
      {id:'A01',personId:'P02',title:'参与新项目玩法概念验证',owner:'玩法负责人',due:day(-21),status:'进行中'},
      {id:'A02',personId:'P03',title:'为经济系统培养第二负责人',owner:'系统负责人',due:day(-35),status:'待开始'}
    ],
    config: { targetRole:'系统/数值', stage:'孵化探索', weights:{player:15,craft:20,complexity:25,delivery:5,collaboration:10,exploration:25} },
    calibrations: [],
    selectedPersonId:'P02',
    updatedAt:new Date().toISOString()
  };
}
