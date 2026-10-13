const bcrypt = require('bcryptjs') 
const db = require('../models')
const User = db.User
const Teacher = db.Teacher
const Course = db.Course
const fs = require('fs')

const userController = {
  signUpPage: (req, res) => {
    return res.render('signup')
  },

  signUp: (req, res) => {
    // 確認密碼
    if(req.body.passwordCheck !== req.body.password){
      req.flash('error_messages', '兩次密碼輸入不同！')
      return res.redirect('/signup')
    } else {
      // 確認是否有重複註冊
      User.findOne({where: {email: req.body.email}}).then(user => {
        if(user){
          req.flash('error_messages', '信箱重複！')
          return res.redirect('/signup')
        } else {
          User.create({
            name: req.body.name,
            email: req.body.email,
            password: bcrypt.hashSync(req.body.password, 10)
          }).then(user => {
            Teacher.create({
              name: req.body.realName,
              phone: req.body.phone,
              UserId: user.id
            })
            req.flash('success_messages', '成功註冊帳號！')
            return res.redirect('/signin')
          })  
        }
      })    
    }
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