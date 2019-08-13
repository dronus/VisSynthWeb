package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image/jpeg"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
	"text/template"
)

type Config struct {
	Url string
}

func categories() []string {
	var all []string

	files, err := ioutil.ReadDir("./static/themes")
	if err != nil {
		log.Fatal(err)
	}

	for _, f := range files {
		all = append(all, f.Name())
	}

	return all
}

func indexHandler(w http.ResponseWriter, r *http.Request) {
	t, _ := template.ParseFiles("./index.html")
	t.Execute(w, categories())
}

func saveHandler(w http.ResponseWriter, r *http.Request) {
	decoder := json.NewDecoder(r.Body)
	var data struct {
		DataUrl string
		Id      string
	}

	err := decoder.Decode(&data)
	if err != nil {
		log.Println(err)
	}

	ascii := strings.SplitAfter(data.DataUrl, "base64,")[1]
	binary, err := base64.StdEncoding.DecodeString(ascii)
	if err != nil {
		log.Println(err)
	}

	reader := bytes.NewReader(binary)
	img, err := jpeg.Decode(reader)
	if err != nil {
		log.Println(err)
	}

	f, err := os.Create("selfies/" + data.Id + ".jpg")
	if err != nil {
		log.Println(err)
	}

	if err := jpeg.Encode(f, img, nil); err != nil {
		f.Close()
		log.Println(err)
	}
}

func main() {
	var cfg Config
	j, _ := ioutil.ReadFile("config.json")
	err := json.Unmarshal(j, &cfg)
	if err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/", indexHandler)
	http.HandleFunc("/save", saveHandler)

	http.HandleFunc("/static/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, r.URL.Path[1:])
	})

	http.HandleFunc("/selfies/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, r.URL.Path[1:])
	})

	log.Fatal(http.ListenAndServe(cfg.Url, nil))
}
