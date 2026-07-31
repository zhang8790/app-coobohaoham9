var fs = require('fs')
var SENS = ['治疗', '治愈', '降压', '降血糖', '抗癌', '增强免疫', '排毒', '病灶', '保证', '百分百', '特效', '强身', '暴富', '躺赚', '静态收益', '级差']
var files = [
  'src/utils/badge-definitions.ts',
  'src/utils/constitution-test.ts',
  'src/utils/seasonal-box.ts',
  'src/utils/today-food-therapy.ts',
  'src/pages/knowledge-atlas/index.tsx',
]
files.forEach(function(f) {
  try {
    var c = fs.readFileSync('C:/Users/zhanglin/Desktop/app-coobohaoham9/' + f, 'utf8')
    SENS.forEach(function(w) {
      var i = c.indexOf(w)
      if (i > -1) {
        console.log('FOUND', f, 'word:', w)
        console.log('  context:', c.substring(Math.max(0, i - 30), i + 60))
      }
    })
  } catch(e) {
    console.log('SKIP', f, e.code)
  }
})
console.log('done')
