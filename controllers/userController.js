const userService = require('../services/userService')
const db = require('../models')
const User = db.User
const Teacher = db.Teacher
const Course = db.Course
const fs = require('fs')

const userController = {
  signUpPage: (req, res) => {
    return res.render('signup')
  },

  signUp: async (req, res) => {
    const body = req.body ?? {}

    if (body.passwordCheck !== body.password) {
      req.flash('error_messages', '兩次密碼輸入不同！')
      return res.redirect(303, '/signup')
    }

    const result = await userService.signUp({
      name: body.name,
      email: body.email,
      password: body.password,
      realName: body.realName,
      phone: body.phone
    })

    if (!result.ok) {
      const errors = {
        INVALID_INPUT: '請完整填寫姓名、暱稱、信箱與密碼，文字欄位限 255 字以內。',
        INVALID_EMAIL: 'Email 格式不正確，例如 name@example.com。',
        INVALID_PHONE: '手機必須是 09 開頭的十位數字，例如 0912345678。',
        PASSWORD_TOO_LONG: '密碼過長，請縮短後再試。',
        EMAIL_EXISTS: '信箱重複！'
      }

      req.flash('error_messages', errors[result.code] ?? '目前無法註冊。')
      return res.redirect(303, '/signup')
    }

    req.flash(
      'success_messages',
      '成功註冊帳號！帳號編號：' + result.userNo
    )

    return res.redirect(303, '/signin')
  },

  signInPage: (req, res) => {
    return res.render('signin')
  },

  signIn: (req, res) => {
    req.flash('success_messages', '成功登入！')
    res.redirect('/cramschool')
  },

  logout: (req, res, next) => {
    req.logout((err) => {
      if (err) {
        return next(err)
      }

      req.flash('success_messages', '登出成功！')
      return res.redirect('/signin')
    })
  },
  //目前登錄先做老師這個身分的使用者
  getUser: (req, res) => {
    Promise.all([
      Teacher.findOne({
        include: { model: Course },
        where: { UserId: req.params.id, status: 1 }
      }),
      Teacher.findOne({
        raw: true,
        nest: true,
        include: { model: User },
        where: { UserId: req.params.id }
      }),
    ]).then(([teacher, userData]) => {
      let userIsMatch = true
      if (req.user.id !== Number(req.params.id)){
        userIsMatch = false
      }
      if (teacher === null){
        console.log('Not found!')
        res.redirect('/cramschool/teachers')
      } else {
        const courses = teacher.Courses.map(r => ({
          ...r.dataValues
        }))
        return res.render('userprofile', {
          teacher: userData,
          courses: courses,
          userIsMatch: userIsMatch
        })  
      }
    })
  },

  getEditUserPage: (req, res) => {
    return User.findByPk(req.params.id, {
      raw:true,
      nest: true, 
      include: [Teacher]
    }).then(user => {
      if (req.user.id !== Number(req.params.id)){
        return res.redirect(`/users/${req.user.id}`)
      }
      return res.render('editprofile', { 
        user: user
      })
    })
  },

  putUser: (req, res) => {
    const file = req.file
    if (file) {
      fs.readFile(file.path, (err, data) => {
        if (err) console.log('Error: ', err)
        fs.writeFile(`upload/${file.originalname}`, data, () => {
          return Teacher.findOne({ where: { UserId : req.user.id } })
            .then((teacher) => {
              teacher.update({
                name: req.body.name,
                sex: req.body.sex,
                birth: req.body.birth,
                phone: req.body.phone,
                address: req.body.address,
                education: req.body.education,
                school: req.body.school,
                image: file ? `/upload/${file.originalname}` : teacher.image
              }).then((teacher) => {
                req.flash('success_messages', 'user was successfully to update')
                res.redirect('/')
              })
            })
        })
      })
    } else {
      return Teacher.findOne({ where: { UserId : req.user.id } })
        .then((teacher) => {
          teacher.update({
            name: req.body.name,
            sex: req.body.sex,
            birth: req.body.birth,
            phone: req.body.phone,
            address: req.body.address,
            education: req.body.education,
            school: req.body.school,
            image: teacher.image
          }).then((teacher) => {
            req.flash('success_messages', 'user was successfully to update')
            res.redirect('/')
          })
        })
    }
  },
}

module.exports = userController