var session = require('express-session');
var mongoose = require('mongoose');
var nodemailer = require('nodemailer');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var bcrypt = require('bcrypt-nodejs');
var async = require('async');
var crypto = require('crypto');

var express = require('express');
var path = require('path');
var favicon = require('static-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var flash = require('express-flash');

// model
var userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});

userSchema.pre('save', function (next) {
    var user = this;
    var SALT_FACTOR = 5;

    // 这句一直有点不理解，这个和字面上看起来不一样啊
    // only hash the password if it has been modified (or is new)
    if (!user.isModified('password')) {
        return next();
    }

    // generate a salt
    bcrypt.genSalt(SALT_FACTOR, function (err, salt) {
        if (err) {
            return next(err);
        }

        // hash the password using our new salt
        bcrypt.hash(user.password, salt, null, function (err, hash) {
            if (err) {
                return next(err);
            }
            // override the cleartext password with the hashed one
            user.password = hash;
            next();
        });
    });
});

// 留意cb，其实他肯定必须指定两个形参，来接受bcypt.compare传给它的err或者isMatch
userSchema.methods.comparePassword = function (candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function (err, isMatch) {
        if (err) {
            return cb(err);
        };
        cb(null, isMatch);
    });
};

// 调用是这样的，
// user.comparePassword('Password123', function(err, isMatch) {
//     if (err) throw err;
//     console.log('Password123:', isMatch); // -> Password123: true
// });
// 其实这个的意思，我感觉是
// (function(candidatePassword, cb) {
//     bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
//         if (err) {
//             return cb(err)
//         };
//         cb(null, isMatch);
//     });
// })('Password123', function(err, isMatch) {
//     if (err) throw err;
//     console.log('Password123:', isMatch); // -> Password123: true
// })
// 这下你该明白了吧
var User = mongoose.model('User', userSchema);

var app = express();

mongoose.connect('mongodb://localhost/forgotpass');

passport.use(new LocalStrategy(function (username, password, done) {
    User.findOne({ username: username }, function (err, user) {
        if (err) return done(err);
        if (!user) return done(null, false, { message: 'Incorrect username.' });
        user.comparePassword(password, function (err, isMatch) {
            if (err) return done(err);
            if (isMatch) {
                return done(null, user);
            } else {
                return done(null, false, { message: 'Incorrect password.' });
            }
        });
    });
}));

passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

// Middleware
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(favicon());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(session({ secret: 'session secret key' }));
app.use(flash());
app.use(express.static(path.join(__dirname, 'public')));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/', function (req, res) {
    res.render('index', { title: 'Express', user: req.user });
});

app.get('/login', function (req, res) {
    res.render('login', { user: req.user });
});

app.post('/login', function (req, res, next) {
    passport.authenticate('local', function (err, user, info) {
        if (err) return next(err);
        if (!user) {
            return res.redirect('/login');
        }
        req.logIn(user, function (err) {
            if (err) return next(err);
            return res.redirect('/');
        });
    })(req, res, next);
});

app.get('/signup', function (req, res) {
    res.render('signup', {
        user: req.user
    });
});

app.post('/signup', function (req, res) {
    var user = new User({
        username: req.body.username,
        email: req.body.email,
        password: req.body.password
    });

    user.save(function (err) {
        req.logIn(user, function (err) {
            res.redirect('/');
        });
    });
});

app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});

app.get('/forgot', function (req, res) {
    res.render('forgot', {
        user: req.user
    });
});

app.post('/forgot', function (req, res, next) {
    async.waterfall([
        function (done) {
            crypto.randomBytes(20, function (err, buf) {
                var token = buf.toString('hex');
                done(err, token);
            });
        },
        function (token, done) {
            User.findOne({ email: req.body.email }, function (err, user) {
                if (!user) {
                    req.flash('error', 'No account with that email address exists.');
                    return res.redirect('/forgot');
                }

                user.resetPasswordToken = token;
                user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

                user.save(function (err) {
                    done(err, token, user);
                });
            });
        },
        function (token, user, done) {
            var smtpTransport = nodemailer.createTransport({
                host: 'smtp.qq.com', // 主机
                secure: true, // 使用 SSL
                port: 465, // SMTP 端口
                auth: {
                    user: 'doubimike@qq.com', // 账号
                    pass: '' // 密码
                }
            });
            var mailOptions = {
                to: user.email,
                from: 'doubimike@qq.com',
                subject: 'Node.js Password Reset',
                text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                    'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                    'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                    'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                req.flash('info', 'An e-mail has been sent to ' + user.email + ' with further instructions.');
                done(err, 'done');
            });
        }
    ], function (err) {
        if (err) return next(err);
        res.redirect('/forgot');
    });
});

app.get('/reset/:token', function (req, res) {
    User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function (err, user) {
        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/forgot');
        }
        res.render('reset', {
            user: req.user
        });
    });
});

app.post('/reset/:token', function (req, res) {
    async.waterfall([
        function (done) {
            User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function (err, user) {
                if (!user) {
                    req.flash('error', 'Password reset token is invalid or has expired.');
                    return res.redirect('back');
                }

                user.password = req.body.password;
                user.resetPasswordToken = undefined;
                user.resetPasswordExpires = undefined;

                user.save(function (err) {
                    req.logIn(user, function (err) {
                        done(err, user);
                    });
                });
            });
        },
        function (user, done) {
            var smtpTransport = nodemailer.createTransport('SMTP', {
                service: 'Gmail',
                auth: {
                    user: 'zhang.hang.sail@gmail.com',
                    pass: ''
                }
            });
            var mailOptions = {
                to: user.email,
                from: 'passwordreset@demo.com',
                subject: 'Your password has been changed',
                text: 'Hello,\n\n' +
                    'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                req.flash('success', 'Success! Your password has been changed.');
                done(err);
            });
        }
    ], function (err) {
        res.redirect('/');
    });
});

app.listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});
