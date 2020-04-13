local function lua()
    local i = 0
    while arg[i] ~= nil do
        i = i - 1
    end
    return arg[i + 1]
end

local function exec(...)
    local args = table.pack(...)
    table.insert(args, 1, lua())
    os.execute(table.concat(args, " "))
end

local function build(ver)
    exec("build/"..ver.."/manual/2html", "<build/"..ver.."/manual/manual.of", ">doc/en-us/"..ver.."/manual.html")
    os.remove("out/en-us/"..ver.."/.compiled")
end

build "54"
build "53"
print "OK!"
